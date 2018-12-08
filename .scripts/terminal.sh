#!/usr/bin/env bash
docker run --rm -it -v $(pwd):/usr/src/app -p 1337:1337 express-primer /bin/bash