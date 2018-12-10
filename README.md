# express-primer
Adds validation and spec generation to express apps.

## What?
Express Primer is a more robust base for creating Node APIs, with built-in request (and response) validation, easy route nesting, and automatic spec generation and documentation.

## Why?
Express by itself is a very powerful and flexible tool for creating APIs, but it lacks many features that can significantly improve the quality of APIs and their development.

## How?
We provide several helper classes that make use of standard technologies like JSONSchema and OpenAPI. These helper classes create introspection into your API, which naturally and automatically enables features such as validation and documentation.

### JSONSchema in 15 seconds
JSONSchema is a way to describe the shape and format of JSON objects in the form of a "schema", which is in itself just a JSON object.
This schema can then be used to validate objects against its rules, as well as for documentation via OpenAPI.

### OpenAPI in 15 seconds
OpenAPI is a way to describe your API and its various facets, such as endpoints, request/response structure, models, parameters, etc.
Like JSONSchemas, it is simply a JSON object. This object can then be ingested to generate documentation, API clients, tests, mocks, etc.
Many components within the OpenAPI spec are described by JSONSchemas.

## Installation
```bash
npm install express-primer express ajv --save
```
The `express` and `ajv` packages are peer dependencies, so they must be installed for `express-primer` to work.

## Usage
Instead of interacting with Express directly, you will be interacting with Express Primer's classes.

They are: `Endpoint`, `EndpointError`, `Response`, and `Router`.

### `Endpoint`
The `Endpoint` class is a significantly upgraded alternative to traditional Express route handlers. It gives your route handlers the ability to:
- annotate your endpoint for documentation and validation
- automatically validate requests
- use and return promises



#### Examples

The simplest example looks like this:
```js
const { Endpoint } = require('express-primer');

class HelloWorldEndpoint extends Endpoint {
    
    handler(req) {
        return 'hello world!';
    }
}
```

Or, even smaller:
```js
const HelloWorldEndpoint = Endpoint.withHandler(req => 'hello world!');
```

Here's a more complex example with automatic request validation. If a request fails validation, a 400 error is automatically sent back, along with relevant validation details. This example validates the request query params (found in `req.query`), but you can validate any property of the incoming request (shown later).

```js
const { Endpoint } = require('express-primer');

class ListUsersEndpoint extends Endpoint {
    
    querySchema() {
        
        return Endpoint.objectSchema({
            page: {
                type: 'integer',
                minimum: 1
            },
            limit: {
                type: 'integer',
                enum: [ 10, 20, 50, 100 ]
            }
        });
    }
    
    handler(req) {
        
        /**
         * Fetch users from some async source.
         * The "page" and "limit" query params were automatically validated before reaching this handler.
         */
        return Users.fetchAll({ 
            page: req.query.page,
            limit: req.query.limit
        });
    }
}
```

We can also document the expected response. In the generated OpenAPI spec, our endpoint will show both the expected request and expected response:

```js
const { Endpoint } = require('express-primer');

class ListUsersEndpoint extends Endpoint {
    
    querySchema() {
        return Endpoint.objectSchema({
            page: {
                type: 'integer',
                minimum: 1
            },
            limit: {
                type: 'integer',
                enum: [ 10, 20, 50, 100 ]
            }
        });
    }
    
    responseCodeSchemas() {
        /**
         * Return an object where the keys are the http response codes, and the values
         * are JSONSchemas for the response associated with that response code. 
         * In this case, the schema is a reference to one defined elsewhere,
         * which makes it easy to define common schemas in one place and use them in multiple endpoints.
         */
        return {
            '200': Endpoint.openApiReference('#/schemas/User')
        };
    }
    
    handler(req) {
        
        return Users.fetchAll({ 
            page: req.query.page,
            limit: req.query.limit
        });
    }
}
```
We can also choose to use the schemas in `responseCodeSchemas` to validate our responses before sending them to the client. If a response fails validation, a 500 error is sent instead.
```js
/**
* Instead of exporting ListUsersEndpoint directly, export a subclass that has "validateResponses" set to true.
*/
module.exports = ListUsersEndpoint.withDefaultOptions({ validateResponse: true });
```

