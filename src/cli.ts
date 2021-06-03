#!/usr/bin/env node

import { IFixOptions, run } from "./index";
import { parse } from "./argv";

run(parse(process.argv) as IFixOptions);
