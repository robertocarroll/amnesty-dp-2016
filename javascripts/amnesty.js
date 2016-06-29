(function (global) {

if('querySelector' in document && 'addEventListener' in window) {
  var jsCheck = document.getElementById('map-no-show');
  jsCheck.id="map";
}

d3.select(window).on("resize", throttle);

var scaleAdjust;
var windowWidth = window.innerWidth;

if (windowWidth < 752) {
  scaleAdjust = 1.6;
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
var tooltipBar = d3.select("#bar-chart").append("div").attr("class", "tooltip hidden");

var sliderContainer;
var customSlider;
var sliderPlayPauseButton;
var sliderPlayPauseButtonState;

var pymChild = new pym.Child();

var defaultLang= "en";
var supportedLanguages = ['ar', 'en', 'es', 'fr'];
var lang = getLangFromQueryString();
var dir;
setLangAndDir(lang);
var dictionary;
var barChartWidth, barChartHeight;
var detailTemplate;
var detailBoxOpen = false;
var selectedCountryId;

function Dictionary(dictionaryJson) {
  this.dictionary = dictionaryJson;
}

Dictionary.prototype.getTranslation = function (key, language) {
  var translation = '';

  if (language == undefined) {
    language = lang;
  }

  if ( this.dictionary.hasOwnProperty(key) && this.dictionary[key].hasOwnProperty(language) ) {
    translation = this.dictionary[key][language];
  }

  return translation;
}

var data = [];

setup(width,height);

function setup(width,height){
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

function getLangFromQueryString(){
  // Mostly shamelessly cribbed from here: http://stackoverflow.com/a/901144/20578
  var lang = defaultLang;
  var regex = new RegExp("[?&]" + "lang" + "(=([^&#]*)|&|#|$)");
  var results = regex.exec(window.location.href);

  if (results && results[2]) {
    lang = decodeURIComponent(results[2].replace(/\+/g, " "));
  }

  return lang;
}

function setLangAndDir(lang) {
  var htmlEl = document.getElementsByTagName("html")[0];

  if (supportedLanguages.indexOf(lang) > -1) {
    htmlEl.lang = lang;
  }

  if (lang === "ar") {
    htmlEl.dir = "rtl";
    dir = "rtl";
  }
  else {
    dir = "ltr";
  }
}

function translateHTML() {
  var el,
      translateTextEls = document.querySelectorAll('[data-translate]'),
      translateTitleEls = document.querySelectorAll('[data-translate-title]'),
      i;

  for (i=0; i<translateTextEls.length; i++) {
    el = translateTextEls[i];
    el.innerHTML = dictionary.getTranslation( el.getAttribute('data-translate') );
  }

  for (i=0; i<translateTitleEls.length; i++) {
    el = translateTitleEls[i];
    el.title = dictionary.getTranslation( el.getAttribute('data-translate-title') );
  }
}

function reset() {
  active.classed("active", false);
  active = d3.select(null);
  g.transition().duration(750).attr("transform", "");
}

//Loads in the world data, the active countries, and the translation dictionary
queue()
    .defer(d3.json, "data/world-topo.json")
    .defer(d3.json, "data/data.json")
    .defer(d3.json, "lang/dictionary.json")
    .await(ready);

function ready(error, world, active, dict) {
  dictionary = new Dictionary(dict);
  translateHTML();

  var countries = topojson.feature(world, world.objects.countries).features;
  topo = countries;

  // Add localised names and statuses to data, so that they can be used more easily in templates.
  for (var i=0; i<active.length; i++) {
    var data_year = active[i]
    for (var j=0; j<data_year.countries.length; j++) {
      var data_country = data_year.countries[j];

      data_country.name__localised = dictionary.getTranslation(data_country.id);
      data_country.status__localised = dictionary.getTranslation(data_country.status);
    }
  }

  activeCountries = active;
  coastline = topojson.mesh(world, world.objects.countries, function(a, b) {return a === b});
  draw(topo, activeCountries, coastline);

  setupBarChart(barChartWidth, barChartHeight, activeCountries);
  setUpSliderPlayPauseButton();
  setupSlider();

  pymChild.sendHeight();
}

function draw(topo, activeCountries, coastline) {
 var yearData = _.filter(activeCountries, function(val) {
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

  var yearTotal = document.getElementById('overview-year');
  var yearTemplate = Hogan.compile("{{year}}");
  var yearOutput = yearTemplate.render(yearData[0]);
  yearTotal.innerHTML = yearOutput;

  var executionsTotal = document.getElementById('executions-total');
  var template = Hogan.compile("{{total-executions}}");
  var output = template.render(yearData[0]);
  executionsTotal.innerHTML = output;

  var searchCountries = document.getElementById('search-box');
  var searchTemplate = Hogan.compile('<form onsubmit="return false;"><label class="visually-hidden" for="search-box-input">' + dictionary.getTranslation('SEARCH COUNTRY') + '</label><input id="search-box-input" class="awesomplete" data-list="{{#countries}}{{name__localised}},{{/countries}}" placeholder="' + dictionary.getTranslation('SEARCH COUNTRY') + '" /></form>');
  var searchOutput = searchTemplate.render(yearData[0]);
  searchCountries.innerHTML = searchOutput;

  new Awesomplete(document.querySelector('.awesomplete'));
  document.querySelector('.awesomplete').addEventListener('awesomplete-selectcomplete', function (e) {
    var selectedCountryName = e.text.value;

    for (var i=0; i<yearCountries.length; i++) {
      if (yearCountries[i].name__localised === selectedCountryName) {
        activateCountry(yearCountries[i]);
        break;
      }
    }
  });

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
            .html('<div class="title-text">'+ dictionary.getTranslation(d.id) + '</div>');
        })
        .on("mouseout",  function(d,i) {
          tooltip.classed("hidden", true);
        });

  activeCountry.on('click', activateCountry);

}

function activateCountry(d){
  var countryElement = this;

  detailBoxOpen = true;
  
  if (d.hasOwnProperty('since') && d.hasOwnProperty('status')) {
    selectedCountryId = d.id;
  }
  else {
    // If d doesn't look like a country object, then it's probably a list of all country objects for the current year, passed in from the timeline's change event listener. We thus need to find just the data for the country currently displayed in the detail box.
    for (var i=0; i<d.length; i++) {
      if (d[i].id === selectedCountryId) {
        d = d[i];
        break;
      }
    }
  }

  if (countryElement.nodeName !== 'path') {
    countryElement = document.querySelector('path[id="' + d.id + '"]:not(.country)');
  }

  active.classed("active", false);
  active = d3.select(countryElement).classed("active", true);

  var detailBox = document.getElementById('detail-box');
  detailBox.classList.add("reveal");
  if (d.status == "ABOLITIONIST") {
    detailBox.classList.add("ABOLITIONIST");
  }
  else {
    detailBox.classList.remove("ABOLITIONIST");
  }

  detailTemplate = Hogan.compile("<div class='wrapper'><div id='btn-close'>×</div><h1 class='no-caps-title'>{{name__localised}}</h1><div class='status-block'><h2 class='mv2'>{{status__localised}}</h2></div>{{#since}}<div class='since-date'><h3 class='mv2 ttu dark-grey'>" + dictionary.getTranslation('SINCE') + " {{since}}</h3></div>{{/since}}<div class='definition'><h3 class='mv2'>{{definitions}}</h3></div></div><div class='totals-block'>{{#death-penalties}}<div class='media bg-white pa3'><div class='media__img'><img class='death-sentences-icon' src='images/hammer.svg'></div><div class='media__body'><h2 class='ttu kilo mt0 mb0'>{{death-penalties}}</h2><h3 class='ttu gamma mt0 mb2 lh-reset'>" + dictionary.getTranslation('DEATH SENTENCES') + "</h3></div></div>{{/death-penalties}}{{#executions}}<div class='media bg-black white pa3'><div class='media__img'><img class='executions-icon' src='images/WhiteNoose.svg'></div><div class='media__body'><h2 class='ttu kilo mt0 mb2'>{{executions}}</h2><h3 class='ttu gamma mt0 mb0 lh-reset'>" + dictionary.getTranslation('EXECUTIONS') + "</h3></div></div>{{/executions}}</div></div>");
  var output = detailTemplate.render(d);
  detailBox.innerHTML = output;

  var btnClose = document.getElementById('btn-close');
  btnClose.addEventListener('click', function(event) {
    reset();
    detailBox.classList.remove("reveal");
    detailBoxOpen = false;
    selectedCountryId = null;
    document.querySelector('#search-box-input').value = '';
  });
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

function setupBarChart(barChartWidth, barChartHeight, activeCountries) {

  var margin = {top: 10, right: 0, bottom: 20, left: 0};
  var widther = document.getElementById('bar-chart-wrapper').offsetWidth;

  barChartWidth = widther - margin.left - margin.right;
  barChartHeight = 250 - margin.top - margin.bottom;

  var yearData = _.filter(activeCountries, function(val) {
    return val.year === currentYear;
  });

  var fullnameKeys = ["ABOLITIONIST", "ABOLITIONIST FOR ORDINARY CRIMES", "ABOLITIONIST IN PRACTICE", "RETENTIONIST"];
  var fullnameKeyIndex;

  //clear the data array so it's just the current year
  data = [];

  for (var yearDataProperty in yearData[0]) {
    fullnameKeyIndex = fullnameKeys.indexOf(yearDataProperty);

    if (fullnameKeyIndex > -1) {
      data.push({
        fullnameKey: fullnameKeys[fullnameKeyIndex],
        fullname: dictionary.getTranslation(fullnameKeys[fullnameKeyIndex]),
        value: yearData[0][yearDataProperty]
      });
    }
  }

  var width = barChartWidth,
      height = barChartHeight,
      barHeight = 20,
      labelHeight = 20;

  var scale = d3.scale.linear()
      .domain([0, d3.max(data, function (d) { return parseInt(d.value, 10); })])
      .range([0, width]);

  var chart = d3.select("#bar-chart")
      .append("svg")
      .attr("width", width)
      .attr("height", height);

  var bar = chart.selectAll("g")
      .data(data)
      .enter().append("g")
      .attr("transform", function(d, i) { return "translate(0," + ( (i * barHeight) + ( (i)*labelHeight ) ) + ")"; });

  bar.append("text")
    .attr("x", 0)
    .attr("text-anchor", function () {
      if (dir === "rtl") {
        return 'end';
      }
      else {
        return 'start';
      }
    })
    .attr("y", labelHeight-3)
    .text(function(d) { return d.fullname; });

  bar.append("rect")
      .attr("width", function (d) { return scale(d.value); })
      .attr("height", barHeight)
      .attr("y", labelHeight)
      .attr("class", function (d) { return d.fullnameKey.replace(/ /g, '_').toUpperCase(); });

  var offsetPieL = document.getElementById('bar-chart').offsetLeft+(width/80);
  var offsetPieT =document.getElementById('bar-chart').offsetTop+(height/80);

  bar
    .on("mousemove", function(d,i) {
        var mouse = d3.mouse(d3.select('#bar-chart').node());
          tooltipBar
            .classed("hidden", false)
            .attr("style", "left:"+(mouse[0]+offsetPieL)+"px;top:"+(mouse[1]+offsetPieT)+"px")
            .html('<div class="title-text">' + d.value + ' ' + dictionary.getTranslation('COUNTRIES') + '<br><br>' + dictionary.getTranslation(d.fullnameKey + ' DEFINITION') + '</div>');

        })
        .on("mouseout",  function(d,i) {
          tooltipBar.classed("hidden", true);
        });
}

function setUpSliderPlayPauseButton() {
  sliderPlayPauseButton = document.getElementById('slider-play-pause');
  sliderPlayPauseButton.style.height = '60px';/* Must match the custom slider’s height below, taking borders into account */

  sliderPlayPauseButton.addEventListener('click', function () {
    if (sliderPlayPauseButtonState === 'play') {
      playSlider();
    }
    else {
      pauseSlider();
    }
  });

  function playSlider() {
    sliderPlayPauseButton.className = 'pause';
    sliderPlayPauseButton.innerHTML = dictionary.getTranslation('PAUSE');
    sliderPlayPauseButtonState = 'pause';
    customSlider.play();
  }

  function pauseSlider() {
    sliderPlayPauseButton.className = 'play';
    sliderPlayPauseButton.innerHTML = dictionary.getTranslation('PLAY');
    sliderPlayPauseButtonState = 'play';
    customSlider.pause();
  }

  sliderPlayPauseButton.className = 'play';
  sliderPlayPauseButton.innerHTML = dictionary.getTranslation('PLAY');
  sliderPlayPauseButtonState = 'play';
}

function setupSlider() {
  sliderContainer = document.getElementById('slider');
  sliderContainer.style.width = windowWidth+'px';

  customSlider = chroniton()
    .domain([new Date('2007'), new Date('2015')])
    .hideLabel()
    .tapAxis(function (axis) {
      axis.orient('top');
    })
    .width(windowWidth - sliderPlayPauseButton.getBoundingClientRect().width)
    .height(58)
    .playButton(false)
        .playbackRate(1)
        .loop(true);

  d3.select("#slider")
      .call(customSlider);

  customSlider
    .setValue(new Date('2015'));

  customSlider
    .on('change', function(date) {
      var newYear = date.getFullYear().toString();
      if (newYear != currentYear) {
        currentYear = newYear;
        d3.select('svg').remove();
        setup(width,height);
        draw(topo, activeCountries, coastline);
        d3.select("#bar-chart > svg").remove();
        setupBarChart(barChartWidth, barChartHeight, activeCountries);

        if (detailBoxOpen) {
          var yearData = _.filter(activeCountries, function(val) {
            return val.year === currentYear;
          });

          var d = yearData[0].countries;
          activateCountry(d);
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

  barChartWidth = document.getElementById('bar-chart-wrapper').offsetWidth;
  barChartHeight = (barChartWidth/2)+(barChartWidth/2.5);
  d3.select("#bar-chart > svg").remove();
  setupBarChart(barChartWidth, barChartHeight, activeCountries);
}

var throttleTimer;
function throttle() {
  window.clearTimeout(throttleTimer);
    throttleTimer = window.setTimeout(function() {
      redraw();
      pymChild.sendHeight();
    }, 200);
}

})(window);
