# express-primer
Express Primer is a more robust base for creating Node APIs, with built-in request (and response) validation, easy route nesting, and automatic spec generation and documentation.

## How?
We provide several helper classes that make use of standard technologies like [JSON Schema](https://json-schema.org/) and [OpenAPI Spec](https://swagger.io/docs/specification/about/) (formerly known as Swagger Spec). These helper classes create introspection into your API, which naturally and automatically enables features such as validation and documentation.

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

The two primary classes are `Endpoint` and `Router`.

The gist is to create `Endpoints` (instead of Express route handlers), which can then be grouped and routed to URLs using a `Router` (instead of Express `app[METHOD]`). 

### A visual explanation

#### Simple example

Here's a simple "hello world" *Express* app:
```js
const express = require('express');
const app = express();

app.get('/', (req, res) => {
    
    res.send('hello world!');
});

app.listen(8080);
```


Here's the *Express Primer* version:
```js
const { Endpoint, Router } = require('express-primer');

class HelloWorldEndpoint extends Endpoint {
    handler(req) {
        return 'hello world!';
    }
}

const router = new Router();
router.route('/', HelloWorldEndpoint);

const app = router.mount();

app.listen(8080);
```

A bit different, but not by much, and the benefits of the Express Primer approach are not immediately obvious. For simple apps like this, Express is a better option. But, as your app becomes increasingly complex, things change:


#### Complex example

Consider this *Express* app:
```js
const express = require('express');
const app = express();

app.get('/api/v1/hello', (req, res) => {
    
    res.send('hello world!');
});

app.get('/api/v1/greeting', (req, res) => {
    
    res.send({ result: `${req.query.chosenGreeting} world!` });
});

app.listen(8080);
```
True, it's still compact and easily understandable. But as an API, this app presents no information about itself to the outside world or to other developers. There is no easy way to validate or constrain the `chosenGreeting`, or to even document to the client of this API what the inputs and outputs are of these endpoints.

Advantages in brevity are lost if validation and documentation are part of your goals (as they should be!). These problems become much more apparent as the number and complexity of endpoints grow.


Now, here's the *Express Primer* version:
```js
const { Endpoint, Router } = require('express-primer');

/**
* Create a "hello" endpoint.
*/
class HelloEndpoint extends Endpoint {
    
    responseCodeSchemas() {
        // maps a response code to the expected JSONSchema for that code.
        return {
            '200': { 
               type: 'string',
               const: 'hello world!'
           }
        };
    }
    
    handler(req) {
        // returned items are passed to res.send
        // can also return Promises
        return 'hello world!';
    }
}

/**
* Create a "greeting" endpoint.
*/
class GreetingEndpoint extends Endpoint {
    
    querySchema() {
        // a JSONSchema describing the expected req.query object.
        return {
            properties: {
                chosenGreeting: {
                    description: 'Create your own greeting by substituting your own word for "hello".',
                    type: 'string',
                    maxLength: 25,
                    default: 'hello'
                }
            }
        };
    }
    
    responseCodeSchemas() {
        // maps a response code to the expected JSONSchema for that code.
        return {
            '200': {
                type: 'object',
                properties: {
                    result: { 
                        type: 'string'
                    }
                },
                required: ['result']
            }
        };
    }
    
    handler(req) {
        // returned items are passed to res.send
        // can also return Promises
        return { result: `${req.query.chosenGreeting} world!` };
    }
}

/**
* Route to the created endpoints.
*/
const router = new Router();

router.group('/api', router => {

   router.group('/v1', router => {
       
       router.route('/hello', HelloEndpoint);
       
       router.route('/greeting', GreetingEndpoint);
   });
   
   router.serveSpec('/spec');
});

const app = router.mount();

app.listen(8080);
```

The above is clearly much more verbose than the Express method. But what have we gained from this extra work?
- You are now clearly able to see the **full** description and constraints of all request parameters and response bodies, along with the corresponding response status code.
- Request parameters are automatically validated before the handler is executed.
- Invalid requests are automatically rejected with the appropriate 400 error.
- Routes are very easily grouped.
- An OpenAPI spec is generated and served at the `/api/spec` URL.
- Documentation is automatically built from the served OpenAPI spec (via Swagger UI).

Other benefits that will be illustrated in later examples are:
- Validate *any* request property.
- Optionally validate responses.
- The ability to return promises from request handlers.
- Restrict middleware to specific groups.
- Protect and document authenticated route groups.

## Next steps

- Look at the API and examples for the `Endpoint` class.
- Look at the API and examples for the `Router` class.