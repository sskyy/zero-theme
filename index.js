var path = require('path'),
  Promise = require('bluebird'),
  _ = require('lodash'),
  fs = require('fs'),
  appUrl  = process.cwd(),
  argv = require('optimist').argv,
  less = require('gulp-less'),
  gulp = require('gulp'),
  sourcemaps = require('gulp-sourcemaps')

function walk(dir, filter) {
  var results = [];
  var list = fs.readdirSync(dir)

  list.forEach(function(file) {
    file = dir + '/' + file;
    var stat = fs.statSync(file)
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file, filter));
    } else {
      filter( file ) && results.push(file);
    }
  });
  return results
};

function fill( length, initial ){
  return Array.apply(null, new Array(length)).map(function(){ return initial})
}

function findExtension( collection, exts, item){
  return _.find( exts, function( ext ){ return collection[item+"."+ext]})
}

function preprocessLess( lessFile ){
  return new Promise(function(resolve, reject){
    gulp.src(lessFile)
      .pipe(sourcemaps.init())
      .pipe(less())
      .pipe(sourcemaps.write())
      .pipe(gulp.dest(path.dirname( lessFile)))
      .on("end",function(){
        resolve()
      })
      .on('error',function(){ reject()})
  })
}

function generateThemeHandler( moduleName, themeConfig, cache ){
  var root = this
  var logger = root.dep.logger

  var matchRoute = path.join("/"+ moduleName, (themeConfig.prefix?themeConfig.prefix:"")) ,
    themePath = path.join('modules',moduleName, themeConfig.directory )

  return function( req, res, next ){
    var restRoute = {
        url:req.path.replace( matchRoute , ""),
        method : req.param('_method') || 'get'
      },
      cachePath = path.join( appUrl, themePath, restRoute.url),
      page


    var fireParams = _.extend({},restRoute,{req:req,res:res})

    req.bus.fcall("theme.render", fireParams, function(){
      var bus = this

      //1. deal with pre-process resource files
      if( !argv.prod ){
        if( /\.css$/.test(cachePath) ){
          var lessFile =cachePath.replace(/\.css$/,".less")

          if(  cache.statics[lessFile] ){
            //read from less and compile
            return preprocessLess(lessFile).then(function(){
              bus.data('respond.file', cachePath)
            })
          }
        }else{
          //TODO handle coffee files

        }
      }

      //2. deal with resource files
      if( /\.[a-zA-Z]+$/.test(cachePath) ) {
//        logger.log("THEME","find static file", cachePath)
        if(cache.statics[cachePath] ){
          bus.data('respond.file', cachePath)
        }
      //3. check if current view route need to mock
      }else if( page = root.findMockOption( root.mock[moduleName], restRoute, themePath).template ){
        logger.log("THEME","find model match", restRoute)

        return bus.fire('request.mock', fireParams).then(function(){
          logger.log("THEME","model action done", restRoute.url)
          bus.data('respond.page', page)
          //merge locals
          return getLocals.call(root, root.locals, {url:req.path,method:'get'}).then(function( locals ){
            bus.data('respond.data', locals)
          }).catch(function(e){
            console.error(e)
          })

        }).catch(function(err){
          logger.error(err)
        })

      //4. check if current view route match any page
      }else if(page = root.findPage(cache,restRoute,themePath, root.config.engines)){
        logger.log("THEME"," find view page match", restRoute.url)

        //deal with locals
        bus.data( 'respond.page',page )
        return getLocals.call(root, root.locals, {url:req.path,method:'get'}).then(function( locals ){
          bus.data('respond.data',locals)
        })
      }else{
        logger.log("THEME"," cannot find any match",JSON.stringify(restRoute),cachePath)
      }
    }).then(function(){
      next()
    }).catch(function(err){
      logger.error(err)
      next()
    })
  }
}

function getLocals( locals, route ){
  var root = this
  var logger = root.dep.logger

  return new Promise(function( resolve, reject){
    var matchedHandlers = root.dep.request.getRouteHandlers( route.url, route.method, locals),
      results = {}
    logger.log("theme","getLocals", route.url)

    applyNext(0)

    function applyNext( n ){
      if( !matchedHandlers[n] ){
        return resolve(results)
      }

      var applyResult = _.isFunction(matchedHandlers[n].data) ? matchedHandlers[n].data(req) : matchedHandlers[n].data
      Promise.resolve(applyResult).then(function( resolvedResult ){
        if(_.isObject(results)){
          _.merge( results, _.cloneDeep(resolvedResult))
        }
        applyNext(++n)
      })
    }
  })
}


function simpleHash( array ){
  return _.zipObject( array, fill(array.length, true))
}

function inArray( array, item ){
  return array.indexOf( item) !== -1
}

function needEngine( engines, page ){
  return inArray( engines, page.split(".").pop() )
}

function not( func){
  return function(){
    return !func.apply(this, arguments)
  }
}

/**
 * @description
 * 为所有依赖该模块并声明了 theme 属性的模块提供主题服务。
 * 当访问的路径为 `/模块名/view/任意名字` 时，主题就开始接管，接管的规则为：
 *
 *   1. 当 `任意名字` 和某个 model 名字相同时，将触发相应的 model 方法，并将 bus.data('respond') 中的数据传给同名模板。
 *   2. 当 `任意名字` 和主题文件夹下的某个模板文件同名时，将直接渲染该模板文件。如果同时在theme.locals中声明一个同名属性，那么会将该属性的值作为数据传给模板。如果改属性值是一个函数，那么将执行该函数，然后将 bus.data('respond') 作为数据传给模板。
 *   3. 当 `任意名字` 和主题文件夹下的某个文件匹配时，直接输出该文件。
 *
 * @module theme
 *
 * @example
 * //theme 字段示例
 * {
 *  directory : 'THEME_DIRECTORY'
 * }
 *
 */
var themeModule = {
  config : {
    'engines'  : ['ejs','jade','hbs']
  },
  index : null,
  cache : {},
  route : {},
  locals : [],
  mock : {},
  /**
   * @param module
   * @returns {boolean}
   */
  expand : function( module ){
    if( !module.theme ) return false

    var root = this,logger = root.dep.logger,moduleName = module.name
    root.cache[moduleName] = {}

    //[].concat means make it an array
    _.forEach( [].concat( module.theme), function( themeConfig){
      var matchRoute = path.join("/"+ moduleName, (themeConfig.prefix?themeConfig.prefix:"")) ,
        themePath = path.join('modules',moduleName, themeConfig.directory)

      //1. cache all files in  hash map
      root.cache[moduleName] = root.cache[moduleName] || {}
      root.cache[moduleName][matchRoute]  = {
        page: simpleHash( walk(path.join(appUrl, themePath), _.partial(needEngine, root.config.engines) ) ),
        statics: simpleHash(walk( path.join(appUrl, themePath), not(_.partial(needEngine, root.config.engines))))
      }

      if( themeConfig.locals ){
        _.forEach( themeConfig.locals, function( data, url ){
          root.locals.push(_.extend(root.dep.request.standardRoute( url ),{handler:{data:data}}))
        })
      }

      //2. check if there are route need mock
      if( themeConfig.mock ){
        root.mock[moduleName] = themeConfig.mock
      }

      //3. generate handler
      logger.log("THEME","match route",matchRoute, themeConfig.directory)
      root.dep.request.add( matchRoute + "/*",generateThemeHandler.call(root,moduleName, themeConfig, root.cache[moduleName][matchRoute]) )

      //TODO may overwrite
      if( themeConfig.index){
        root.index = themeConfig.index
      }
    })
  },
  findPage : function( cache, restRoute, themePath,engines ){
    var root = this
    //TODO find the right view file
    var templateName, extension
    if( extension = findExtension( cache.page,engines, path.join( appUrl, themePath, restRoute.url.slice(1) ) ) ){
        //match certain files
        templateName = restRoute.url.slice(1)
    }

    return extension ? path.join( themePath, templateName) + "." +extension : false
  },
  findMockOption : function( mock, restRoute, themePath){
    if( !mock ) return false

    var root = this,
      output = false
    _.any( Object.keys(mock), function( mockUrl ){
      var match =root.dep.request.matchUrl( restRoute.url, mockUrl)
      if( match){
        output = {mockUrl:mockUrl,match :match,template:path.join( themePath,mock[mockUrl] )}
        return true
      }
    })
    return output
  },
  bootstrap : {"function":function(){
    //set index page
    if( themeModule.index ){
      themeModule.dep.request.add("GET /", function( req, res){
        res.redirect( themeModule.index )
      })
    }
  },
  order : {before : "request.bootstrap"}}
}

module.exports = themeModule

