declare module 'yargs-unparser' {
  type Argv = string[];
  interface Arguments {
    _: string[];
    [argName: string]: any;
  }

  interface UnparserOptions {
    alias?: Record<string, string[]>;
    default?: Record<string, string>;
    command?: string;
  }

  interface Unparser {
    (args: Arguments, opts?: UnparserOptions): Argv;
  }

  declare var yargsUnparser: yargsUnparser.Unparser;
  export = yargsUnparser;
}

