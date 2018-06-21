require([

    "esri/Map",
    "esri/views/MapView",
    "esri/layers/FeatureLayer",
    "esri/layers/VectorTileLayer",
    "esri/symbols/SimpleLineSymbol",
    "esri/core/watchUtils",
    "esri/geometry/support/webMercatorUtils",
    "esri/geometry/Point",
    "dojo/dom",
    "dojo/domReady!"

], function(Map, MapView, FeatureLayer, VectorTileLayer, SimpleLineSymbol, watchUtils, webMercatorUtils, Point, dom) {
    //global vars
    var mapLongLattZoom = [0, 0, 1] //default
    var endNo //highest number in the attribute
    var startNo //lowest number in attribute
    var fieldToAnimate //attribute selected 
    var stepNumber //increment value
    var setIntervalSpeed = 16.6 //refresh speed in ms
    var restarting = false //flag to control removing animation 
    var updateField = false //check for attribute change
    var intervalFunc //animation interval name
    var overRidingField //casts url field as no.1 selection in attribute selector
    var view
    var map

    //for recasting global symbols
    var geometryType //the geometry type of the feature
    var newSymbol 
    var newType 

    initalise()

    function initalise(){
    map = new Map({
        basemap: "dark-gray-vector"
    });
    
    view = new MapView({
        container: "viewDiv",
        map: map,
        zoom: 3,
        center: [0, 0]
    });

        //event listeners
        document.getElementById("play").addEventListener("click", play)
        document.getElementById("fs-url").addEventListener("blur", addFeatureLayer)
        document.getElementById("fs-url").addEventListener("change", addFeatureLayer)
    
        //check URL for paramaters, if there's some. Add it in.
        var browserURL = window.location.search
        if (browserURL != "") {
            updateField = true
            browserURL = browserURL.replace("?", '')
            var partsOfStr = browserURL.split(',')
            document.getElementById("fs-url").value = partsOfStr[0]
            overRidingField = partsOfStr[1]
            document.getElementById("animation-time").value = partsOfStr[2]
            mapLongLattZoom = [parseInt(partsOfStr[3]), parseInt(partsOfStr[4]), parseInt(partsOfStr[5])]
    
        } else {
            defaultService()
        }

        view.when(function() {
            watchUtils.when(view, "stationary", updateMapLongLatt)
            
            var pt = new Point({
                longitude: mapLongLattZoom[0],
                latitude: mapLongLattZoom[1]
              });
    
            view.goTo({
                target: pt,
                zoom: mapLongLattZoom[2]
            })
        })
        //once feature layer url has been set, now add it to the map.
        addFeatureLayer()
    }

    //if there's no paramaters, then add these in as a default.
    function defaultService() {
        document.getElementById("fs-url").value = "https://services.arcgis.com/Qo2anKIAMzIEkIJB/arcgis/rest/services/hurricanes/FeatureServer/0"
        document.getElementById("animation-time").value = 10
    }

    //this generates a new, sharable url link.
    function updateBrowserURL() {
        history.pushState({
            id: 'homepage'
        }, 'Home', '?' + document.getElementById("fs-url").value + ',' + document.getElementById("selection").value + ',' + document.getElementById("animation-time").value + ',' + mapLongLattZoom);
    }

    //when map moves, update url.
    function updateMapLongLatt() {
        mapLongLattZoom = [view.center.longitude, view.center.latitude, view.zoom]
        updateBrowserURL()
    }

    //adds the feature layer to the map.
    function addFeatureLayer() {
        var flURL = document.getElementById("fs-url").value

        if (flURL != "") {
            featureLayer = new FeatureLayer({
                url: flURL
            });
            map.removeAll()
            map.add(featureLayer)

            //overides ANY scale threshold added to feature layer.
            featureLayer.maxScale = 0 
            featureLayer.minScale = 100000000000 

            //rest call to get attribute minimum and maximum values.
            getFields(flURL)

            document.getElementById("fs-url").style.borderBottomColor = "green"
        } else {
            map.remove(featureLayer)
            document.getElementById("fs-url").style.borderBottomColor = "red"
        }

    }

    //populating selection drop down based on featurelayer.
    function getFields(flURL) {
        $.ajax({
            url: flURL + "?f=json",
            type: "GET"
        }).done(function(FLfields) {
            var fieldsObj = JSON.parse(FLfields)
            document.getElementById("feature-layer-name").innerHTML = fieldsObj.name
            updateExtent(fieldsObj.extent)
            select = document.getElementById('selection')
            select.innerHTML = ''

            geometryType = fieldsObj.geometryType
            symbolSwitcher(geometryType)

            for (i = 0; i < fieldsObj.fields.length; i++) {
                if (fieldsObj.fields[i].sqlType != "sqlTypeNVarchar") {

                    var opt = document.createElement('option')
                    opt.value = fieldsObj.fields[i].name
                    opt.innerHTML = fieldsObj.fields[i].name

                    if (i === 0 && updateField === true) {
                        opt.value = overRidingField
                        opt.innerHTML = overRidingField
                    }

                    if (updateField === true && fieldsObj.fields[i].name === overRidingField) {
                        opt.value = fieldsObj.fields[0].name
                        opt.innerHTML = fieldsObj.fields[0].name
                        updateField = false
                    }

                    select.appendChild(opt)
                }

            }
            updateBrowserURL()
        });
    }

    function updateExtent(newExtent) {
        if (newExtent.spatialReference.wkid === 102100) {
            view.extent = newExtent
        }
        if (newExtent.spatialReference.wkid != 102100) {
            view.extent = {
                xmax: 20026375.71466102,
                xmin: -20026375.71466102,
                ymax: 9349764.174146919,
                ymin: -5558767.721795811
            }
        }
    }

    function play() {
        //Stops any previously added animations in the frame
        stopAnimation()

        //There's an unknown issue caused by "ObjectID"
        //This is currently a workaround for it.
        if(document.getElementById("selection").value === "OBJECTID"){
            if (document.getElementById("fs-url").value != "") {
                featureLayer = new FeatureLayer({
                    url: document.getElementById("fs-url").value
                });
                map.removeAll()
                map.add(featureLayer)
            }
        }

        //update with changed values.
        updateBrowserURL()

        //queries the current feature layer url and field to work out start and end frame.
        getMaxMin();
    }

    function getMaxMin() {
    var flURL = document.getElementById("fs-url").value
    var field = document.getElementById("selection").value

        $.ajax({
            url: flURL + "/query",
            type: "GET",
            data: {
                'f': 'pjson',
                'outStatistics': '[{"statisticType":"min","onStatisticField":"' + field +
                    '", "outStatisticFieldName":"MinID"},{"statisticType":"max","onStatisticField":"' +
                    field + '", "outStatisticFieldName":"MaxID"}]'
            }
        }).done(function(data) {
            var dataJSONObj = JSON.parse(data)

            fieldToAnimate = field
            startNumber(dataJSONObj.features[0].attributes.MinID)
            endNo = dataJSONObj.features[0].attributes.MaxID

            //generate step number here too
            var difference = Math.abs(dataJSONObj.features[0].attributes.MinID - dataJSONObj.features[
                0].attributes.MaxID)
            var differencePerSecond = difference / document.getElementById("animation-time").value
            stepNumber = differencePerSecond / setIntervalSpeed
            startNo = dataJSONObj.features[0].attributes.MinID
            animate(dataJSONObj.features[0].attributes.MinID)

            //adding empty frames at the start and end for fade in/out
            endNo += stepNumber * 40
            startNo -= stepNumber * 2
        });

    }

    function stopAnimation() {
        startNumber(null)
        stepNumber = null
        fieldToAnimate = null
        startNo = null
        endNo = null
        restarting = true;
    }

    function startNumber(value) {
        featureLayer.renderer = createRenderer(value);
    }

    function animate(startValue) {
        var currentFrame = startValue

        var frame = function(timestamp) {
            if (restarting) {
                clearTimeout(intervalFunc);
                restating = false
            }

            currentFrame += stepNumber
            
            if (currentFrame > endNo) {
                currentFrame = startNo
            }

            startNumber(currentFrame)

            //animation loop.
            intervalFunc = setTimeout(function() {
                //stops it from overloading.
                requestAnimationFrame(frame)
            }, setIntervalSpeed)
        }

        //recusrive function, starting the animation.
        frame()

        return {
            remove: function() {
                animating = false
            }
        };
    }


    //CHANGE SYMBOLOGY TYPE HERE. (Point, Line or Polygon style)
    function symbolSwitcher(geometryType) {
        //Depending on the feature layer currently added, the symbology will change here.
        //Supporting points, lines and polygons.
        if (geometryType === "esriGeometryPoint") {
            newSymbol = {
                type: "picture-marker",
                url: "images/PointIconImages/2.png",
                width: 20,
                height: 20
            }

            newType = 'simple'
        }

        if (geometryType === "esriGeometryPolyline") {
            newSymbol = {
                type: 'simple-line',
                width: 3,
                color: 'rgb(55, 55, 255)',
                opacity: 1
            }

            newType = 'simple'
        }

        if (geometryType === "esriGeometryPolygon") {
            newSymbol = {
                type: "simple-fill",
                color: "rgb(55, 55, 255)"
            }

            newType = 'simple'
        }
    }

    function createRenderer(now) {
        return {
            type: newType,
            symbol: newSymbol,
            visualVariables: [{
                type: 'opacity',
                field: fieldToAnimate,
                //stops control the fade out
                stops: [{
                        value: now - stepNumber * 40,
                        opacity: 0.0
                        //Change this to 0.1 if you always want it on screen during animation
                    },
                    {
                        value: now - stepNumber * 20,
                        opacity: 0.3
                    },
                    {
                        value: now - stepNumber * 1,
                        opacity: 1
                    },
                    {
                        value: now,
                        opacity: 1
                    },
                    {
                        value: now + stepNumber * 2,
                        opacity: 0
                    }

                ]
            }]
        };
    }

})