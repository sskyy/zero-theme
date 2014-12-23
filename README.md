# zero-theme #

This module help you make your own theme system.

## Usage ##

1. Add dependency to your module package.json file like:

```
{
	"name" : "YOUR_MODULE_NAME",
	"zero" : {
		"dependencies" : {
			"theme" : "^0.0.1"
		}
	}
}
```

2. declare `themes` in your module :

```
{
	theme : [{
        directory : "admin",
        prefix : "admin", //match url /your_module_name/admin
        locals : {}  //any locals attach to any page to render
      }],
}
```

3. Theme module will automatically render template file like `index.jade` as page and others common web resource as static files.
