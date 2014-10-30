angular.module("refineryStatistics", [])

.controller("refineryStatisticsController", function ($scope, $http) {
    var chartMap = {};

    function plot(data, target) {
        var heightWidthRatio = 1.6;
        var widthScaleRatio = 0.8;
        var chartWidth = document.getElementById(target).offsetWidth;
        var chartHeight = chartWidth / heightWidthRatio;
        var chart = c3.generate({
            bindto: "#" + target,
            data: {
                x: "x",
                columns: [
                    ["x", "public", "private", "private shared"],
                    [" ", data.public, data.private, data.private_shared]
                ],
                type: "bar"
            },
            bar: {
                width: { ratio: 0.5 }
            },
            size: {
                width: chartWidth,
                height: chartHeight
            },
            axis: {
                x: { type: "category" },
                y: { tick: { format: d3.format("d") } }
            },
            legend: { show: false }
        });
        chartMap[target] = {
            chart: chart,
            data: data
        };
    }

    $http.get("http://192.168.50.50:8000/api/v1/statistics/?format=json&dataset&workflow&project").success(function (response) {
        var dataset = response.objects[0].dataset;
        var workflow = response.objects[0].workflow;
        var project = response.objects[0].project;

        if (dataset) { plot(dataset, "dataSetChart"); }

        if (workflow) { plot(workflow, "workflowChart"); }
        
        if (project) { plot(project, "projectChart"); }
    });

    window.onresize = function (event) {
        for (var k in chartMap) {
            plot(chartMap[k].data, k);
        }
    };
});
