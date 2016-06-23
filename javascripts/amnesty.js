
//check for JavaScript
if('querySelector' in document && 'addEventListener' in window) {
  var jsCheck = document.getElementById('map-no-show');
  jsCheck.id="map";
}

//Resize event to scale everything if window resizes
d3.select(window).on("resize", throttle);

var scaleAdjust;
var windowWidth = window.innerWidth;

//The map is very different depending on smaller or larger screens

if (windowWidth < 752) {
  scaleAdjust = 1.6;
  /*var clientHeight = document.getElementById('overview-year');
  var distanceFromTop = clientHeight.getBoundingClientRect().bottom;
  var detailBoxHeight = document.getElementById('detail-box');
  detailBoxHeight.style.top = '"' + distanceFromTop + 'px"';*/
}

else {
  scaleAdjust = 1.05;
}

var width = document.getElementById('map').offsetWidth;
var height = width / scaleAdjust;
var center = [width / 2, height / 2];

var startYear = '2015';
var currentYear = startYear;
var tooltip = d3.select("#map").append("div").attr("class", "tooltip hidden");
var activeCountries, yearCountries, topo, borders, coastline, projection, path, svg, g, zoom;
var active = d3.select(null);
var tooltipPie = d3.select("#donut-chart").append("div").attr("class", "tooltip hidden");
var pymChild = new pym.Child();

setup(height,width);

function setup(){
  zoom = d3.behavior.zoom()
            .scaleExtent([1, 6])
            .on("zoom", move);

  projection = d3.geo.mercator()
    .translate([(width/2-30), (height/2)])
    .scale( width / 2 / Math.PI);

  path = d3.geo.path()
          .projection(projection);

  svg = d3.select("#map").append("svg")
      .attr("width", width)
      .attr("height", height)
      .call(zoom)
      .append("g");

  g = svg.append("g");
}

function reset() {
  active.classed("active", false);
  active = d3.select(null);
  g.transition().duration(750).attr("transform", "");
}

//Loads in the world data and the active countries
queue()
    .defer(d3.json, "data/world-topo-new.json")
    .defer(d3.json, "data/data.json")
    .await(ready);

function ready(error, world, active) {
  var countries = topojson.feature(world, world.objects.countries).features;
  topo = countries;
  activeCountries = active;
  coastline = topojson.mesh(world, world.objects.countries, function(a, b) {return a === b});
  draw(topo, activeCountries, coastline);
  pymChild.sendHeight();
}

function draw(topo, activeCountries, coastline) {

  var yearData = activeCountries.filter(function(val) {
    return val.year === currentYear;
  });
  yearCountries = yearData[0].countries;

  topo.forEach(function(d, i) {
        yearCountries.forEach(function(e, j) {
            if (d.id === e.id) {
                e.geometry = d.geometry;
                e.type = d.type;
            }
        });
    });

  var executionsTotal = document.getElementById('executions-total');
  var template = Hogan.compile("{{total-executions}}");
  var output = template.render(yearData[0]);
  executionsTotal.innerHTML = output;

  var country = g.selectAll(".country").data(topo);
  country.enter().insert("path")
      .attr("class", "country")
      .attr("d", path)
      .attr("id", function(d,i) { return d.id; })
      .attr("title", function(d,i) { return d.properties.name; })
      .style("fill", function(d, i) { return d.properties.color; });

  var activeCountry = g.selectAll(".activeCountry").data(yearCountries);

   g.selectAll(".country")
        .data(topo)
       .enter().append("path")
        .attr("class", "country")
        .attr("id", function(d) { return d.id; })
        .attr("d", path);

   g.insert("path", ".graticule")
      .datum(coastline)
      .attr("class","coastline")
      .attr("d", path);

  activeCountry.enter().append("path")
      .attr("class", function(d,i) {
        var status = d.status.toLowerCase().replace(/.\s/g,"");
        return status;
      })
      .attr("id", function(d) { return d.id; })
      .attr("d", path);

  //ofsets plus width/height of transform, plus 20 px of padding, plus 20 extra for tooltip offset off mouse
  var offsetL = document.getElementById('map').offsetLeft+(width/80);
  var offsetT =document.getElementById('map').offsetTop+(height/80);

  activeCountry
    .on("mousemove", function(d,i) {
        var mouse = d3.mouse(svg.node()).map( function(d) { return parseInt(d); } );
          tooltip
            .classed("hidden", false)
            .attr("style", "left:"+(mouse[0]+offsetL)+"px;top:"+(mouse[1]+offsetT)+"px")
            .html('<div class="title-text">'+ d.name + '</div>');
        })
        .on("mouseout",  function(d,i) {
          tooltip.classed("hidden", true);
        });

  activeCountry.on('click', function(d){
    active.classed("active", false);
    active = d3.select(this).classed("active", true);

    var detailBox = document.getElementById('detail-box');
    detailBox.classList.add("reveal");
    var detailTemplate = Hogan.compile("<div class='wrapper'><div id='btn-close'>×</div><h1 class='no-caps-title'>{{name}}</h1><div class='status-block'><h2 class='mv2'>{{status}}</h2></div>{{#since}}<div class='since-date'><h3 class='mv2 ttu dark-grey'>since {{since}}</h3></div>{{/since}}<div class='definition'><h3 class='mv2'>{{definitions}}</h3></div></div><div class='totals-block'>{{#death-penalties}}<div class='media bg-white pa3'><div class='media__img'><img class='death-sentences-icon' src='images/hammer.svg'></div><div class='media__body'><h2 class='ttu kilo mt0 mb0'>{{death-penalties}}</h2><h3 class='ttu gamma mt0 mb2 lh-reset'>Death Sentences</h3></div></div>{{/death-penalties}}{{#executions}}<div class='media bg-black white pa3'><div class='media__img'><img class='executions-icon' src='images/WhiteNoose.svg'></div><div class='media__body'><h2 class='ttu kilo mt0 mb2'>{{executions}}</h2><h3 class='ttu gamma mt0 mb0 lh-reset'>Executions</h3></div></div>{{/executions}}</div></div>");
    var output = detailTemplate.render(d);
    detailBox.innerHTML = output;

    var btnClose = document.getElementById('btn-close');
    btnClose.addEventListener('click', function(event) {
      reset();
      detailBox.classList.remove("reveal");
    });
  });

  pymChild.sendHeight();
}

function move() {
  var t = d3.event.translate;
  var s = d3.event.scale;
  zscale = s;
  var h = height/4;

  t[0] = Math.min(
    (width/height)  * (s - 1),
    Math.max( width * (1 - s), t[0] )
  );

  t[1] = Math.min(
    h * (s - 1) + h * s,
    Math.max(height  * (1 - s) - h * s, t[1])
  );

  zoom.translate(t);
  g.attr("transform", "translate(" + t + ")scale(" + s + ")");
}

d3.select('#zoom-in').on('click', function () {
    var scale = zoom.scale(), extent = zoom.scaleExtent(), translate = zoom.translate();
    var x = translate[0], y = translate[1];
    var factor = 1.2;

    var target_scale = scale * factor;

    if (scale === extent[1]) {
        return false;
    }
    var clamped_target_scale = Math.max(extent[0], Math.min(extent[1], target_scale));
    if (clamped_target_scale != target_scale) {
        target_scale = clamped_target_scale;
        factor = target_scale / scale;
    }
    x = (x - center[0]) * factor + center[0];
    y = (y - center[1]) * factor + center[1];

    zoom.scale(target_scale).translate([x, y]);

    g.transition().attr("transform", "translate(" + zoom.translate().join(",") + ") scale(" + zoom.scale() + ")");
    g.selectAll("path")
            .attr("d", path.projection(projection));
});

d3.select('#zoom-out').on('click', function () {
    var scale = zoom.scale(), extent = zoom.scaleExtent(), translate = zoom.translate();
    var x = translate[0], y = translate[1];
    var factor = 1 / 1.2;

    var target_scale = scale * factor;

    if (scale === extent[0]) {
        return false;
    }
    var clamped_target_scale = Math.max(extent[0], Math.min(extent[1], target_scale));
    if (clamped_target_scale != target_scale) {
        target_scale = clamped_target_scale;
        factor = target_scale / scale;
    }
    x = (x - center[0]) * factor + center[0];
    y = (y - center[1]) * factor + center[1];

    zoom.scale(target_scale).translate([x, y]);

    g.transition()
            .attr("transform", "translate(" + zoom.translate().join(",") + ") scale(" + zoom.scale() + ")");
    g.selectAll("path")
            .attr("d", path.projection(projection));
});

var data = [{
    "fullname": "Abolitionist",
    "definitions":"do not use the death penalty",
        "value": 102
}, {
    "fullname": "Abolitionist for ordinary crimes",
    "definitions":"retain the death penalty only for serious crimes, such as murder, or during times of war",
        "value": 6
}, {
    "fullname": "Abolitionist in practice",
    "definitions":"retain the death penalty in law, but haven’t executed for at least 10 years",
        "value": 32
}, {
    "fullname": "Retentionist",
    "definitions":"retain the death penalty in law",
        "value": 58
}];

var donutWidth = document.getElementById('donut-chart-wrapper').offsetWidth;
var donutHeight = (donutWidth/2)+(donutWidth/2.5);
var radius = Math.min(donutWidth, donutHeight) / 2;
var labelr = radius - 22;

setupDonut(donutWidth,donutHeight);

function setupDonut (donutWidth,donutHeight){

var color = d3.scale.ordinal()
    .range(["#FFFF00", "#b6b6b6", "#7a7d81", "#000000"]);

var arc = d3.svg.arc()
    .outerRadius(radius)
    .innerRadius(radius * (50 / 100));

var pie = d3.layout.pie()
    .sort(null)
    .value(function(d) { return d.value; });

var svgPie = d3.select("#donut-chart").append("svg")
    .attr("width", donutWidth)
    .data([data])
    .attr("height", (donutHeight+10))
  .append("g")
    .attr("transform", "translate(" + donutWidth / 2 + "," + donutHeight / 2 + ")");

  var gPie = svgPie.selectAll(".arc")
      .data(pie(data))
    .enter().append("g")
      .attr("class", "arc");

  gPie.append("path")
      .attr("d", arc)
      .attr("class", "donut-arc")
      .style("fill", function(d) { return color(d.data.value); });

  gPie.append("text")
      .attr("transform", function(d) {
        var xTrig = ( (radius - 12) * Math.sin( ((d.endAngle - d.startAngle) / 2) + d.startAngle ) );
        var yTrig = ( -1 * (radius - 12) * Math.cos( ((d.endAngle - d.startAngle) / 2) + d.startAngle ) );
        if (d.data.fullname == "Abolitionist for ordinary crimes") {
          xTrig = xTrig - 15;
          yTrig = yTrig + 5;
        }

        if (d.data.fullname == "Retentionist") {
          xTrig = xTrig + 15;
        }

        if (d.data.fullname == "Abolitionists in practice") {
          yTrig = yTrig - 20;
        }

        return "translate(" + xTrig + "," + yTrig + ")"; })
      .attr("dy", ".35em")
      .style("text-anchor", function(d) {
        if (d.data.fullname == "Abolitionist for ordinary crimes") { return "start";}
        if (d.data.fullname == "Abolitionist in practice") { return "middle";}
        if (d.data.fullname == "Retentionist") { return "middle";}
        if (d.data.fullname == "Abolitionist") {return "end";}
        else {
          return "start";
        }
      })
      .attr("class", "title-text")
      .text(function(d) {
        return d.data.fullname; })
      .call(wrap, 100)
      .style("fill", function(d) {
        if (d.data.fullname == "Abolitionist for ordinary crimes") { return "black";}
        if (d.data.fullname == "Abolitionist in practice") { return "black";}
        if (d.data.fullname == "Retentionist") { return "white";}
        if (d.data.fullname == "Abolitionist") {return "black";}
        else {
          return "white";
        }});

  var offsetPieL = document.getElementById('donut-chart').offsetLeft+(width/80);
  var offsetPieT =document.getElementById('donut-chart').offsetTop+(height/80);

  gPie
    .on("mousemove", function(d,i) {
        var mouse = d3.mouse(d3.select('#donut-chart').node());
          tooltipPie
            .classed("hidden", false)
            .attr("style", "left:"+(mouse[0]+offsetPieL)+"px;top:"+(mouse[1]+offsetPieT)+"px")
            .html('<div class="title-text">' + d.data.value + ' countries ' + d.data.definitions + '</div>')
        })
        .on("mouseout",  function(d,i) {
          tooltipPie.classed("hidden", true)
        });
}

function wrap(text, width) {
    text.each(function() {
        var text = d3.select(this),
        words = text.text().split(/\s+/).reverse(),
        word,
        line = [],
        lineNumber = 0,
        y = text.attr("y"),
        dy = parseFloat(text.attr("dy")),
        lineHeight = 1.1, // ems
        tspan = text.text(null).append("tspan").attr("x", function(d) { return d.children || d._children ? -10 : 10; }).attr("y", y).attr("dy", dy + "em");
        while (word = words.pop()) {
            line.push(word);
            tspan.text(line.join(" "));
            var textWidth = tspan.node().getComputedTextLength();
            if (tspan.node().getComputedTextLength() > width) {
                line.pop();
                tspan.text(line.join(" "));
                line = [word];
                ++lineNumber;
                tspan = text.append("tspan").attr("x", function(d) { return d.children || d._children ? -10 : 10; }).attr("y", 0).attr("dy", lineNumber * lineHeight + dy + "em").text(word);
            }
        }
    });
}


function redraw() {
  width = document.getElementById('map').offsetWidth;
  windowWidth = window.innerWidth;

  if (windowWidth < 752) {
    scaleAdjust = 1.6;
    var clientHeight = document.getElementById('overview-year');
    var distanceFromTop = clientHeight.getBoundingClientRect().bottom;
    var detailBoxHeight = document.getElementById('detail-box');
    detailBoxHeight.style.top = '"' + distanceFromTop + 'px"';
  }

  else {
    scaleAdjust = 1.05;
  }

  var height = width / scaleAdjust;
  d3.select('svg').remove();
  center = [width / 2, height / 2];
  setup(width,height);
  draw(topo, activeCountries, coastline);

  donutWidth = document.getElementById('donut-chart-wrapper').offsetWidth;
  donutHeight = (donutWidth/2)+(donutWidth/2.5);
  radius = Math.min(donutWidth, donutHeight) / 2;
  d3.select("#donut-chart > svg").remove();
  setupDonut(donutWidth,donutHeight);
}

var throttleTimer;
function throttle() {
  window.clearTimeout(throttleTimer);
    throttleTimer = window.setTimeout(function() {
      redraw();
      pymChild.sendHeight();
    }, 200);
}



