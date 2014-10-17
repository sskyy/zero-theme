var fs= require('fs'),
  path = require('path'),
  Git = require('git-wrapper2')
  Repo = require('git').Repo

var GitHubApi = require("github");

var github = new GitHubApi({
  // required
  version: "3.0.0",
  // optional
  debug: true
});

var modulePath = path.join(process.cwd(),"modules")


var modules = fs.readdirSync(modulePath).filter(function(name){return !/^\./.test(name)})

modules.forEach(function( module){
  fs.exists(path.join(modulePath,module,".git"), function(exist){
    if( !exist){
      return console.log(err, module)
    }
    gitCommitAndPush( path.join(modulePath,module))
  })
})


function gitCommitAndPush( modulePath){
  var moduleName = modulePath.split("/").pop()
  new Repo(modulePath, {},function(err, repo){
    if( err ){
      return console.log(err, "aaaa")
    }

    repo.git.git('add',{},'--all',function(err, res) {
      if( err ) return console.log("commit err",err)
      repo.git.git("commit",{},"-m","standard all modules to npm", function(err, res){
        console.log( modulePath, ("commit done " +res).green,err||"")
        if( !err ){
          repo.git.git("push",{},"origin","master",function(err, res){
            console.log(  modulePath,("push done " + res).green,err||"")
            if( err ){
              console.log("try to add origin ")
            }
          })
        }
      })
    })
  })

//  var git = Git({"git-dir":modulePath+"/.git"})
//  git.commit("standard all modules to npm", function(err, msg){
//    if( err) return console.log("commit error",err)
//    git.push("origin","master",function(err,msg){
//      if(err) return console.log("push error",err)
//      console.log(moduleName,msg)
//    })
//  })

}

