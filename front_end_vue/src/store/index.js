import Vue from 'vue'
import Vuex from 'vuex'
import {Route, Stop, Bus, Directions} from '../GTFSMap.js'
Vue.use(Vuex)

import axios from 'axios'
import {apiBaseUrl} from '../config.js'

export default new Vuex.Store({
    state:{
        routes: [],
        selected: undefined,
        currentRoute: undefined,
        tripStop: undefined,
        directions:undefined,
        time: 22200,
    },
    mutations: {
        setDirections(state, dir){
            if (state.directions) state.directions.deactivate()
            state.directions = dir
        },
        unsetDirections(state){
            if (state.directions) state.directions.deactivate()
            state.directions = undefined
        },
        setRoutes(state, routes){
            state.routes = routes
        },
        setTime(state, time){
            state.time = time
        },
        selectRoute(state, route){
            if(state.currentRoute) state.currentRoute.deactivate()
            route.activate()
            state.currentRoute = route
        },
        setSelected(state, obj){
            if(state.tripStop) state.tripStop.deselect()
            state.tripStop = undefined

            if(state.selected) state.selected.deselect()
            obj.select()
            state.selected = obj
        },
        deselectAll(state){
            if(state.currentRoute) state.currentRoute.deactivate()
        },
        unsetSelected(state){
            if(state.tripStop) state.tripStop.deselect()
            state.tripStop = undefined
            if (state.selected) state.selected.deselect()
            if (state.currentRoute) state.currentRoute.showStops()
            state.selected = undefined
        },
        setTripStop(state, stop){
            if (state.tripStop) state.tripStop.deselect()
            if (state.tripStop == stop) {
                state.tripStop.deselect()
                state.tripStop = undefined
            } else{
                stop.select()
                state.tripStop = stop    
            }
        },
        unsetTripStop(state){
            if(!state.tripStop) return
            state.tripStop.deselect()
            state.tripStop = undefined
        }
    },
    actions: {
        unselect({commit, state}){
            return commit('deselectAll')
        },
        getDirectionsWithTime({commit, state, dispatch}, data){
            commit('setTime', data.time)
            clearTimeout(this.debounce)
            this.debounce = setTimeout(function() {
                 if (data.to && data.from){
                    dispatch('getDirections', {from: data.from, to: data.to}) 
                 }
            }.bind(this), 200)
        },
        getDirections({commit, state, dispatch}, endPoints){
            return axios.get(`${apiBaseUrl}directions/${endPoints.from}/${endPoints.to}/${state.time}`)
            .then(res => {
                if (res.data.error) {
                    commit('unsetDirections')
                    throw(new Error(res.data.error))
                    return
                }
                let d = new Directions(res.data)
                commit('setDirections', d)
            })
        },
        getRoutes( {commit, state} ){
            return axios.get(`${apiBaseUrl}routes`)
            .then(routeData => {
                let routes = routeData.data.reduce((obj, route) => {
                    obj[route.route_id] = new Route(route)
                    return obj
                }, {})
                commit('setRoutes', routes)
            })
        },
        showRoute({commit, state, dispatch}, route){  /* Refactor Me */                
            commit('selectRoute', route)
            let busPromise = axios.get(`${apiBaseUrl}buslocations/${route.id}`)
            .then(r => {
                route.buses = r.data.map(item => new Bus(item, route, dispatch.bind(null, 'selectBus')))
            })
           
            let stopPromise = route.stops
            ? (route.stops.map(stop => stop.activate()), Promise.resolve())
            : axios.get(`${apiBaseUrl}stops_on_route/${route.id}`) 
              .then(r => {
                  route.stops = r.data.map(stopdata =>  new Stop(stopdata, dispatch.bind(null, 'selectStop')))
              })

            return Promise.all([busPromise, stopPromise])
            .then(() => route.fitMapToRoute())
            .catch(console.log)
        },
        selectStop({commit, state}, stop){
            if(state.selected === stop) return commit('unsetSelected')
            axios.get(`${apiBaseUrl}stop_times/${stop.id}`)
            .then(stop_times => {
                stop.schedule = stop_times.data.schedule
                commit('setSelected', stop)
            })
        },      
        selectBus({commit, state, dispatch}, bus){
            if(state.selected === bus) {
                state.currentRoute.showStops()
                commit('unsetSelected')
            }
            else {
                state.currentRoute.hideStops()
                axios.get(`${apiBaseUrl}route_stops/${bus.tripID}/${bus.routeNumber}/${bus.direction}`)
                .then(r => {
                    bus.stops = r.data.map(stop => {
                        return new Stop(stop, function(stop){   
                            commit('setTripStop', stop)   
                        })
                    })
                     commit('setSelected', bus)
                })  
            }
        }
    }
})