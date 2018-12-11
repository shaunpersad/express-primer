# express-primer
Express Primer augments [Express.js](https://expressjs.com) with a few helper classes that make use of standard technologies like [JSON Schema](https://json-schema.org/) and [OpenAPI Spec](https://swagger.io/docs/specification/about/) (formerly known as Swagger Spec). These helper classes create introspection into your API, which naturally and automatically enables features such as validation and documentation.

## Installation

```bash
npm install express-primer express ajv --save
```
The [`express`](https://www.npmjs.com/package/express) and [`ajv`](https://www.npmjs.com/package/ajv) packages are peer dependencies, so they must be installed for `express-primer` to work.


## Problem solving - Describing an API endpoint

Here's a simple Express API:
```js
app.get('/greeting', (req, res) => {
    
    res.send({ result: `${req.query.chosenGreeting} world!` });
});
```
The "greeting" endpoint sends back an object as JSON, based on the `chosenGreeting` query parameter.

There are a few issues with this code:
- This endpoint is not documented (or is documented separately from the code).
- There is no validation or visible constraints on the input.

Express Primer aims to solve this by providing ways to write your APIs that are both self-documenting and provides validation.

### The solution: Express Primer's `Endpoint` class

Express route handlers are regular functions. While desirable for most purposes, this architecture breaks down when attempting to associate other metadata to these functions.

Express Primer, on the other hand, represents route handlers as merely a single method in a bigger Endpoint class dedicated to that route. This allows us to associate all kinds of useful functionality and data to an endpoint, rather than being constrained to a single function.

With this approach, we can rewrite our greeting endpoint as follows:
```js
const { Endpoint } = require('express-primer');

class GreetingEndpoint extends Endpoint {
    
    querySchema() {
        return {
            properties: {
                chosenGreeting: { type: 'string', maxLength: 25, default: 'hello' }
            }
        };
    }

    handler(req) {
        return { result: `${req.query.chosenGreeting} world!` };
    }
}
```
We will go into more detail about the anatomy of this code in other sections, but intuitively, this slightly more verbose version of our original Express endpoint now has a **schema** attached to it that describes exactly what inputs we require. 

What's more, Express Primer uses this information to:
- automatically validate incoming requests (and even adds default values for missing inputs)
- automatically generate an API spec, which auto-generates documentation pages


## Problem solving - Declaring an API's routes

Here's a set of nested routes in Express:
```js
const app = express();
const userRoutes = express.Router();
const petRoutes = express.Router();
const v1Routes = express.router();

userRoutes.get('/:userId', getUserHandler);
userRoutes.route('/').get(listUsersHandler).post(createUserHandler);

petRoutes.get('/:petId', getPetHandler);
petRoutes.route('/').get(listPetsHandler).post(createPetHandler);

v1Routes.use('/users', userRoutes);
v1Routes.use('/pets', petRoutes);

app.use('/api/v1', v1Routes);

app.listen(8080);
```
Unlike Express's route handlers, routing in Express can get very messy! Not just messy, but difficult to reason about at a glance.


### The solution: Express Primer's `Router` class

We can solve this issue by taking inspiration from Laravel's nested routing approach:
```js
const { Router } = require('express-primer');

const router = new Router();

router.group('/api/v1', router => {
    
    router.group('/users', router => {
        
        router.route('/:userId', GetUserEndpoint);
        
        router.route('/', CreateUserEndpoint, 'post');

        router.route('/', ListUsersEndpoint);
    });
    
    router.group('/pets', router => {
        
        router.route('/:petId', GetPetEndpoint);
        
        router.route('/', CreatePetEndpoint, 'post');

        router.route('/', ListPetsEndpoint);
    });    
});

const app = router.mount(); // an express app!

app.listen(8080);
```

Much cleaner! And very easy to see exactly how the routes are assembled. What's more, unlike `express.Router`, Express Primer's `Router` lets you assign group-specific middleware, like so:
```js
router.group(router => {
    
    router.middleware(requiresAuth); // will be applied to both routes below (and any subgroups).
    
    router.route('/me', MeEndpoint);

    router.route('/logout', LogoutEndpoint, 'post');
});

router.route('/login', LoginEndpoint); // not affected by the requiresAuth middleware.
```

The cherry on top is that these routes are also incorporated into the generated OpenAPI spec, which can then be served at any URL you wish:
```js
router.serveSpec('/spec');
```

That spec can then generate documentation via Swagger UI, which looks like [this](https://petstore.swagger.io/);

It can also be used to automatically create API clients for your front-end, using [swagger-js](https://github.com/swagger-api/swagger-js)


## Next steps

We've only just scratched the surface of Express Primer's capabilities.

- Read the `Endpoint` docs + examples (coming soon).
- Read the `Router` docs + examples (coming soon).


## Appendix

### JSON Schema

JSON Schema is a way to describe the shape and format of a JSON value in the form of a "schema", which is just a JSON object with rules.
This schema can then be used to validate JSON against its rules, as well as utilized for documentation via OpenAPI.

Here's an example of how JSON Schemas are used for validation: [RunKit](https://runkit.com/shaunpersad/5c0f2fc1c9c3a70012ca8c84).

Here's a list of keywords you can use in a JSON Schema: [Ajv Docs](https://github.com/epoberezkin/ajv/blob/master/KEYWORDS.md#type).


### OpenAPI

OpenAPI is a way to describe your API and its various facets, such as endpoints, request/response structure, models, parameters, etc.
Like JSON Schemas, it is simply a JSON object. This object can then be ingested to generate documentation, API clients, tests, mocks, etc.
Many components within the OpenAPI spec are described by JSON Schemas.

You can learn about OpenAPI [here](https://swagger.io/docs/specification/basic-structure/) and delve deeper into the spec at its [repo](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.2.md).