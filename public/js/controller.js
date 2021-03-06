var noiDisplay = angular.module('noiDisplay', ['ngSanitize']);
noiDisplay.config(function($locationProvider) {
	$locationProvider.html5Mode({
  	enabled: true,
  	requireBase: false
	});
});
noiDisplay.directive('myClock', ['$interval', 'dateFilter', function($interval, dateFilter) {
	function link(scope, element, attrs) {
		var format,
		timeoutId;
		format = attrs.myClock;
		updateTime();
		function updateTime() {
			element.text(dateFilter(new Date(), format));
		}

		element.on('$destroy', function() {
			$interval.cancel(timeoutId);
		});

		timeoutId = $interval(function() {
			updateTime(); // update DOM
		}, 1000);
	}
	return {
		link: link
	};
}]);

noiDisplay.directive('eventDisplay',function($interval){
	var config = {
		tickColors :['f3d111','f7dd41','becf40','a8c038','de7226','e79441','bfdaee','a9cde8','517435','7c9762','b41f3b','c6526b'],
		numberOfRides : 100,			// max number of rides to display
	};

	function link(self, element, attrs){
		self.lang= 'en';
		if (!self.rides)
			self.rides=[];
		var elaborateData = function(data)	{
			if (!data) return;
			data = data.slice(0,config.numberOfRides);
			var newRides = arr_diff(data,self.rides);
			var departedRides = arr_diff(self.rides,data);
			var now = moment();
			for (i in data){
				data[i].from = moment(data[i].RoomStartDateUTC);
				data[i].startsIn = now<data[i].from ? now.to(data[i].from) : 'in progress';
				data[i].to = moment(data[i].RoomEndDateUTC);
				data[i].time = elaborate(data[i].from,data[i].to,now)
			}
			function elaborate(from,to,now){
                                var value;
                                value = from.format("HH:mm")+' - '+to.format("HH:mm") +'<br/><strong>' +from.format("DD MMM YY")+'</strong>';
                                return value;
                        }

			for(i in departedRides){
				self.rides.splice(departedRides[i],1);
			}
			syncExisting(self.rides, data);
			for (i in newRides){
				self.rides.push(data[newRides[i]]);
			}
		}
		var syncExisting = function(arr1,arr2){
			for (i in arr1)
				for (j in arr2){
					if (arr2[j].EventId === arr1[i].EventId && arr2[j].RoomStartDate === arr1[i].RoomStartDate){
						arr1[i]['EventDescriptionDE'] = arr2[j]['EventDescriptionDE'];
						arr1[i]['EventDescriptionEN'] = arr2[j]['EventDescriptionEN'];
						arr1[i]['EventDescriptionIT'] = arr2[j]['EventDescriptionIT'];
						arr1[i]['from'] = arr2[j]['from'];
						arr1[i]['to'] = arr2[j]['to'];
						arr1[i]['startsIn'] = arr2[j]['startsIn'];
					}
				}
		}
		var arr_diff = function(arr1,arr2){
			var array = new Array();
			for (i in arr1){
				var busExists=false;
				for(j in arr2){
					if (arr2[j].EventId === arr1[i].EventId && arr2[j].RoomStartDate === arr1[i].RoomStartDate){
						busExists=true;
					}
				}
				if(!busExists)
				array.push(i);
			}
			return array;
		}
		function getAvailableLanguages(data){
			if (data){
				var availableLanguages = new Set();
				data.forEach(function(record){
					var langs = Object.keys(record.EventDescription);
					for (lang in langs)
						availableLanguages.add(langs[lang]);
				});
				langArray = Array.from(availableLanguages);
				return langArray;
			}
		}
		self.$watch(attrs.eventDisplay,function(value){
			var languages = getAvailableLanguages(value);
			if (angular.isDefined(self.loopLanguages))
				$interval.cancel(self.loopLanguages);
			self.loopLanguages = $interval(function(){
				if (self.lang && languages){
					var current = languages.indexOf(self.lang) | 0;
					if (current == undefined || current == languages.length-1)
						current = 0;
					else {
							current++;
					}
					self.lang = languages[current];
				}
			},10000);
			elaborateData(value);
		});
        self.customFieldsFilter = function(value,index,array){
            return self.fields ?
            value['TechnologyFields'].reduce((result,value) =>{
                if (self.fields.includes(value.toLowerCase()))
                    return true;
                }
            ,false):true;
        }
	}
	return{
		link:link,
		templateUrl: 'partials/bus.html',
		restrict:'A'

	};
});

noiDisplay.controller('BusStopCtrl', function BusStopCtrl($scope,$interval,$http,$sce,$location) {
	var self= $scope;
	var eventsTill = 14*24*60*60*1000;
	var updateIntervall = 30000;
	self.init = function(){
		$scope.foyer = ($location.search().location ==="foyer");
        $scope.d1= ($location.search().location ==="D1");
        $scope.fields= ($location.search().fields?$location.search().fields.split(','):undefined);

        try{
            $scope.fullFilter = (JSON.parse($location.search().ofs));
        }catch(err){
            console.error(err);
        }
        $scope.$on('$locationChangeSuccess', function(event){
            $scope.pathFilter = $location.hash();
        });
		fetchData().then(function(data){
            self.data= data;
        }).then(fetchRoomMapping).then(function(data){
			self.roomMapping = data;
		}).catch(function(error){
            self.roomMapping= {};
			console.error("unable to retrieve data:" + error);
		});

		$interval(function(){
			fetchData().then(function(data){
				self.data = data;
			}).catch(function(error){
				self.warning = true;
				console.error("unable to retrieve data:" + error);
			});
		},updateIntervall);
        $interval(function(){
            fetchRoomMapping().then(function(data){
                self.roomMapping = data;
            }).catch(function(error){
                self.roomMapping= {};
                console.error("unable to get categories");
            });
        },3600000);
	}

	var fetchRoomMapping = function (){
		return new Promise(
			function(resolve,reject){
				var defaultStartDate = new Date().getTime();
				$http.get("https://tourism.opendatahub.bz.it/api/EventShort/RoomMapping").then(function successH(response) {
					var data = response.data;
					if (response.status != 200 || data == null || data.length===0){
						reject("No data inside");
					}else{
						resolve(data);
					}
				},function errorH(error){
                    reject(error);
                });
			});
	}
	var fetchData = function (){
		return new Promise(
			function(resolve,reject){
				var defaultStartDate = new Date().getTime();
				var params = {
					startdate:defaultStartDate,
					//enddate: defaultStartDate + eventsTill,       //uncomment if you want to limit results in the future
					eventlocation: 'NOI',
					datetimeformat:'uxtimestamp',
					onlyactive: true
				}
				$http.get("https://tourism.opendatahub.bz.it/api/EventShort/GetbyRoomBooked?"+$.param(params)).then(function(response,error) {
					var data = response.data;
					if (response.status != 200 || data == null){
						reject(error);
					}else{
						resolve(data);
					}
				});
			});
	}
});
