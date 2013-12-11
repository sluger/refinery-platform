/* App Module */

var refineryApp = angular.module('refineryApp', [
  'ui.select2',
  'ngResource',
//  'refineryControllers',
]);

/* Controllers */

//var refineryControllers = angular.module('refineryControllers', []);

refineryApp.factory('Workflows', function() {
  'use strict';
  return [
      {"id": 1, "name": "Workflow 1"},
      {"id": 2, "name": "Workflow 2"},
  ];
});

refineryApp.controller('WorkflowListCtrl', function($scope, Workflows) {
  'use strict';
  $scope.workflows = Workflows;
});

//var service = angular.module("apiService", ["ngResource"]);

refineryApp.factory("Workflow", function($resource) {
  return $resource(
    "/api/v1/workflow/:Id/",
    {Id: "@Id", format: "json"},
    {'query':  {method:'GET', isArray: false}}
  );
});

refineryApp.controller('WorkflowListApiCtrl', function($scope, Workflow) {
  'use strict';
  var WorkflowList = Workflow.query(function() {
    $scope.workflows = WorkflowList.objects;
  });
});
