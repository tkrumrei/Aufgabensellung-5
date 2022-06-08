/**
* Musterlösung zu Aufgabe 4, Geosoft 1, SoSe 2022
* @author {Tobias Krumrein}   matr.Nr.: {506269}
*/

"use strict";

//declaration of global variables
var pois;
var alleHaltestellen;
var point;
var departureList;


/**
* @function onLoad function that is executed when the page is loaded
*
* wie Map befüllt wird:
* onLoad() > busAPI.haltestellen() > mainMapInterface.addBusStops()
* wie Tabellen befüllt werden:
* onLoad() > busAPI.haltestellen() > calculateResults() > DocumentInterface.drawBusStopTable()
*/
async function onLoad() {
  //pois = geoJSON.arrayToGeoJSON(pois);
  //calculateResults(point, pois);
  busAPI.haltestellen();
}



//##############################################################################
//## FUNCTIONS
//##############################################################################

/**
* @function calculateResults the function that calculates all results
*/
function calculateResults(point, pois) {
  let results = pois;
  console.log(pois)
  for(let poi of pois.features){
    let distance = turf.distance(
      point, poi.geometry.coordinates,
      {units: 'meters'}
    );
    //add distance to geojson properties for easy use in markers
    poi.properties.distance = distance;
  }

  results = sortByDistance(point, results);

  //get the departures of the nearest stop for the next 30 minutes.
  busAPI.departures(
    results[0].id, 1800
  );
  DocumentInterface.updateDepartureHeader(results[0].name);
  DocumentInterface.clearTable('resultTable');
  DocumentInterface.drawBusStopTable(results);
}

/**
* @function refresh
* @desc called when refresh button presssd are inserted. refreshes the page data.
*/
function refresh() {
  let positionGeoJSON = document.getElementById("userPosition").value;

  try {
    positionGeoJSON = JSON.parse(positionGeoJSON);
    //check validity of the geoJSON. it can only be a point
    if (geoJSON.isValidGeoJSONPoint(positionGeoJSON)) {
      //show the coordinates on the map
      mainMapInterface.updateUserLocation(positionGeoJSON);

      point = positionGeoJSON.features[0].geometry.coordinates;
      calculateResults(point, pois);
      sortByDistance(point, pois);
      mainMapInterface.clearBusStops();
      mainMapInterface.addBusStops(pois);
    } else {
      alert("invalid input.please input a single valid point in a feature collection");
    }
  }
  catch (error) {
    console.log("invalid input. see console for more info.");
    console.log(error);
    alert("invalid input. see console for more info.");
  }
}

/**
* @function sortByDistance
* @desc takes a point and an array of points and sorts them by distance ascending.
* @param point array of [lon, lat] coordinates
* @param pointArray array of points to compare to
* @returns Array with JSON Objects, which contain coordinate and distance
*/
function sortByDistance(point, pointArray) {
  let output = [];

  for (let i = 0; i < pointArray.features.length; i++) {
    let j = 0;
    //Searches for the Place
    while (j < output.length && pointArray.features[i].properties.distance > output[j].distance) {
      j++;
    }
    let newPoint = {
      index : i,
      coordinates: pointArray.features[i].geometry.coordinates,
      distance: Math.round(pointArray.features[i].properties.distance*100)/100,

      name : pointArray.features[i].properties.lbez,
      id: pointArray.features[i].properties.nr,

    };
    output.splice(j, 0, newPoint);
  }

  return output;
}

/**
* Folgende Klassendeklarationen existieren damit Fuikntionen gruppiert werden können.
* Auf diese Weise wirkt der code strukturierter und übersichtlicher. Diese Seite könnte
* genauso gut prozedual programmiert werden, mit minimalen veränderungen an den Methoden.
*/

/** Class for communicating with the BusAPI
* for a more functional approach of xhr, see: https://github.com/streuselcake/jslab/blob/master/client/01-html-js-css/xhr/mensa/mensa.js
*/
class BusAPI{
  constructor(){
    this.API_URL = "https://rest.busradar.conterra.de/prod";
  }

  /**
  * haltestellen
  * @public
  * @desc method to retrieve bus-stop data from busAPI and add them to map
  */
  haltestellen(){
    let halteResponse = fetch(this.API_URL+`/haltestellen`)
    .then(res => res.json())
    .then((data) => {
      pois = data;
      alleHaltestellen = data; //this is needed for selection bbox
      calculateResults(point, pois);
      mainMapInterface.addBusStops(pois);
    });
  }

  /**
  * departures
  * @public
  * @desc method to retrieve upcoming departues from a given bus stop.
  * functions simlar to haltestellen. is called once nearest bus stop is known.
  * @param busStopNr the number of the bus stop as returned by the api.
  * @param time seconds from now during which departures are to be shown. defaults to 1800
  * @see haltestellen
  */
  departures(busStopNr, time){
    //set URL to get nearest departures
    let resource = this.API_URL+`/haltestellen/${busStopNr}/abfahrten?sekunden=`;
    resource += time || 1800;

    fetch(resource)
    .then(res => res.json())
    .then((data) => {
      departureList = data;
      DocumentInterface.clearTable("nextDeparturesTable");
      DocumentInterface.drawDepartureTable(departureList);
      return true;
    });
    return false;
  }
}

/** Class containing all methods for handling the map display on page */
class MapInterface{
  constructor(params){
    //initialise the map view from the given coordinates
    if( params.mapid === undefined ||
      params.baseMap === undefined ||
      params.baseMap.tileLayer === undefined
    ){
      console.log("couldn't initialise map-interface. invalid parameters");
      return false;
    }

    let mapid = params.mapid;
    let view = params.view || [0,0];
    let zoom = params.zoom || 6;
    let baseMap = params.baseMap;

    this.map = L.map(mapid).setView(view, zoom);

    //add basemaps
    this.baseMapLayer = L.tileLayer(
      baseMap.tileLayer, {
        maxZoom : baseMap.maxZoom || 15,
        attribution : baseMap.attribution || ""
      }
    );
    this.baseMapLayer.addTo(this.map);


    //create arrays that contain easily accessible references to all features of
    //each dataset
    //create groups wherein all the features of diffrent datasets will be contained
    this.busStopIndex = [];
    this.busStopGroup = new L.LayerGroup().addTo(this.map);

    this.userPositionLayer = new L.LayerGroup().addTo(this.map);
    this.drawnItems = new L.FeatureGroup().addTo(this.map);

    this.addIcons();
    this.addDrawControls();
    this.addDrawEvents();

  }

  /**
  * @desc function that creates all different icons for different map elements
  */
  addIcons(){
    this.busStopIcon = L.icon({
      iconUrl: 'src4/icons/BusStopIcon.png',
      iconSize: [10, 10],
      iconAnchor: [5,5]
    });
  }

  /**
  * @desc function adds leaflet Draw draw controls to the map
  */
  addDrawControls(){
    this.drawControl = new L.Control.Draw({
      draw:{
        polyline: false,
        polygon: false,
        circle: false,
        marker: false,
      },
      edit: {
        featureGroup: this.drawnItems
      }
    });
    this.map.addControl(this.drawControl);
  }

  /**
  * @desc function adds leaflet Draw Events.
  * In this case only the reactangle is considered.
  */
  addDrawEvents(){
    let drawnItems = this.drawnItems;
    let mapInterface = this;
    this.map.on(L.Draw.Event.CREATED, function(e){
      var type = e.layerType;
      var layer = e.layer;
      var polygon;

      if(type === "rectangle"){
        //turn bbox into a turf polygon
        let c = layer.getLatLngs()[0];
        polygon = turf.polygon([[
          [c[0].lng, c[0].lat],
          [c[1].lng, c[1].lat],
          [c[2].lng, c[2].lat],
          [c[3].lng, c[3].lat],
          [c[0].lng, c[0].lat]
        ]]);
      }

      //intersect bus stops and rectangle
      pois = turf.pointsWithinPolygon(alleHaltestellen,polygon);

      //recalculate & display
      mapInterface.clearBusStops();
      mapInterface.addBusStops(pois);
      DocumentInterface.clearTable("resultTable");
      calculateResults(point, pois);

      //draw bbox layer
      drawnItems.clearLayers();
      drawnItems.addLayer(layer);
    });
  }

  /**
  * @desc clear Bus stops
  * @desc removes all markers from the map when called
  */
  clearBusStops(){
    //empty the indices and featureGroups
    this.busStopIndex = [];
    this.busStopGroup.clearLayers();
  }

  /**
  * @desc adds bus stops to the map
  * @param {GeoJSON} featureCollection
  */
  addBusStops(featureCollection){
    const busStopOpacity = 0.4;
    for(let feature of featureCollection.features){
      let markerCoords = [feature.geometry.coordinates[1],
      feature.geometry.coordinates[0]];
      let markerProperties = feature.properties;

      let marker = L.marker(markerCoords,
        //marker options
        {
          opacity : busStopOpacity,
          riseOnHover: true
        }
      );

      //set cosmetics of the bus stop markers
      marker.setIcon(this.busStopIcon);
      marker.on('mouseover', (e)=>{
        marker.setOpacity(1.0);
      });
      marker.on('mouseout', (e)=>{
        marker.setOpacity(busStopOpacity);
      });

      //bind popup
      let popupString = `
      <b>${markerProperties.lbez}</b><br>
      <ul>
      <li>richtung: ${markerProperties.richtung}</li>
      <li>nr: ${markerProperties.nr}</li>
      <li>distance: ${markerProperties.distance.toFixed(2)} m</li>
      <button class="button" type="button"
      onclick="
      DocumentInterface.showDepartures(${markerProperties.nr}, '${markerProperties.lbez}');
      DocumentInterface.scrollToElement('mainMap')
      ">
      show departures</button>
      </ul>
      `;
      marker.bindPopup(popupString);

      //add the marker to markergroup, so it shows up on the map
      this.busStopIndex.push(marker);
      this.busStopGroup.addLayer(marker);
    }
  }

  /**
  * @desc updates the user Location when called.
  * is called from reresh()
  * @param {GeoJSON} geoJSON describing the point where the user is.
  */
  updateUserLocation(geoJSON){
    this.userPositionLayer.clearLayers();
    let positionMarker = L.geoJSON(geoJSON);
    this.userPositionLayer.addLayer(positionMarker);
  }

}

/** Class containing all static methods for displaying data on page */
class DocumentInterface{

  /**
  * showPosition
  * @public
  * @desc Shows the position of the user in the textarea.
  * callback function that is passed by getLocation
  * @see getLocation
  * @param {*} position Json object of the user
  */
  static showPosition(position) {
    var x = document.getElementById("userPosition");
    //"Skeleton" of a valid geoJSON Feature collection
    let outJSON = { "type": "FeatureCollection", "features": [] };
    //skelly of a (point)feature
    let pointFeature = {"type": "Feature","properties": {},"geometry": {"type": "Point","coordinates": []}};
    pointFeature.geometry.coordinates = [position.coords.longitude, position.coords.latitude];

    //add the coordinates to the geoJson
    outJSON.features.push(pointFeature);
    x.innerHTML = JSON.stringify(outJSON);
  }

  /**
  * getLocation
  * @public
  * @desc function that requests the geographic position of the browser
  * @see getPosition
  */
  static getLocation() {
    var x = document.getElementById("userPosition");
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(this.showPosition);
    } else {
      x.innerHTML = "Geolocation is not supported by this browser.";
    }
  }

  /**
  * drawBusStopTable
  * @desc inserts the bus stop list into the Table on the web-page
  * @param {*} results array of JSON with contains
  */
  static drawBusStopTable(results) {
    var table = document.getElementById("resultTable");
    //creates the Table with the distances
    for (var j = 0; j < 15; j++) {
      var newRow = table.insertRow(j + 1);
      var cel1 = newRow.insertCell(0);
      var cel2 = newRow.insertCell(1);
      var cel3 = newRow.insertCell(2);
      cel1.innerHTML = results[j].name;
      cel2.innerHTML = results[j].coordinates;
      cel3.innerHTML = results[j].distance;
    }
  }

  /**
  * drawBusDepartureTable
  * @desc inserts the results into the Table on the web-page
  * @param {*} results array of JSON with contains
  */
  static drawDepartureTable(results){
    var table = document.getElementById("nextDeparturesTable");
    for (var j = 0; j < results.length; j++) {
      var newRow = table.insertRow(j + 1);
      var cel1 = newRow.insertCell(0);
      var cel2 = newRow.insertCell(1);
      var cel3 = newRow.insertCell(2);
      cel1.innerHTML = results[j].linienid;
      cel2.innerHTML = results[j].richtungstext;
      cel3.innerHTML = this.time(results[j].abfahrtszeit);
    }
  }

  /**
  * updateDepartureHeader
  * @desc updates the header above the departure table with the name of the stop.
  * @param {*} results array of JSON with contains
  */
  static updateDepartureHeader(busStopName){
    if(busStopName === undefined){
      document.getElementById("nextDeparturesHeader").innerHTML = "no upcoming departures";
    } else {
      let message = "upcoming departures from " + busStopName;
      document.getElementById("nextDeparturesHeader").innerHTML = message;
    }

  }

  /**
  * showDepartures
  * @desc shows the departure times of a bus stop of choice on the page
  */
  static showDepartures(busStopNr, busStopName){
    DocumentInterface.updateDepartureHeader(busStopName);
    busAPI.departures(busStopNr, 1800);
  }

  /**
  * clearTable
  * @desc removes all table entries and rows except for the header.
  * @param tableID the id of the table to clear
  */
  static clearTable(tableID){
    //remove all table rows
    var tableHeaderRowCount = 1;
    var table = document.getElementById(tableID);
    var rowCount = table.rows.length;
    for (var i = tableHeaderRowCount; i < rowCount; i++) {
      table.deleteRow(tableHeaderRowCount);
    }
  }

  /**
  * displayGeojsonOnPage
  * @desc psuhes a given string onto the geoJSON-id'd tag in the DOM.
  * @param geoJSONString string, expected to represent geojson but can be anything.
  */
  static displayGeojsonOnPage(geoJSONString){
    document.getElementById('geoJSON').innerHTML = geoJSONString;
  }

  /**
  * time
  * @desc takes a second-value (as in seconds elapsed from jan 01 1970) of the time and returns the corresponding time.
  * source: https://stackoverflow.com/a/35890816
  * @param seconds time in milliseconds
  */
  static time(seconds) {
    seconds = parseInt(seconds); //ensure the value is an integer
    var ms = seconds*1000;
    var time = new Date(ms).toISOString().slice(11, -5);
    return time + " GMT";
  }

  /**
  * scrollToElement
  * @desc makes the page scroll to a specified element
  *  not really necessary. just helps to keep the map in focus when the
  *  departures are updated
  * @param {string} elementID the element to scroll to
  */
  static scrollToElement(elementID){
    // $('html, body').animate({scrollTop: $(`#${elementID}`).offset().top - 128});
    let element = document.getElementById(elementID);
    element.scrollIntoView();
  }

}

/** Class containing methods for geoJSON processing*/
class GeoJSON{
  constructor(){
    this.featureCollection = { "type": "FeatureCollection", "features": [] };
    this.pointFeature = { "type": "Feature", "properties": {}, "geometry": { "type": "Point", "coordinates": [] } };
  }

  /**
  * arrayToGeoJSON
  * @public
  * @desc method that converts a given array of points into a geoJSON feature collection.
  * @param inputArray Array that is to be converted
  * @returns JSON of a geoJSON feature collectio
  */
  arrayToGeoJSON(inputArray) {
    //reset the skeleton, because it's an object reference
    this.featureCollection = { "type": "FeatureCollection", "features": [] };
    //"Skeleton" of a valid geoJSON Feature collection
    let outJSON = this.featureCollection;

    //turn all the points in the array into proper features and append
    for (const element of inputArray) {
      let newFeature = this.pointFeature;
      newFeature.geometry.coordinates = element;
      outJSON.features.push(JSON.parse(JSON.stringify(newFeature)));
    }

    return outJSON;
  }

  /**
  * isValidGeoJSONPoint
  * @public
  * @desc method that validates the input GeoJSON so it'S only a point
  * @param geoJSON the input JSON that is to be validated
  * @returns boolean true if okay, false if not
  */
  isValidGeoJSONPoint(geoJSON) {
    if (geoJSON.features.length == 1 &&
      geoJSON.features[0].geometry.type.toUpperCase() == "POINT"
    ) {
      return true;
    } else {
      return false;
    }
  }

}

//##############################################################################
//## OBJECTS
//##############################################################################
const geoJSON = new GeoJSON();
const busAPI = new BusAPI();
const mainMapInterface = new MapInterface(
  {
    mapid: "mainMap",
    view: [51.96034, 7.62245],
    zoom: 12,
    baseMap: {
      tileLayer: 'https://{s}.tile.openstreetmap.de/tiles/osmde/{z}/{x}/{y}.png',
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }
  }
);
