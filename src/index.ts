#!/usr/bin/env node
import * as dotenv from "dotenv";
import chalk from "chalk";
import { Command } from "commander";
import create from "./commands/create/index";
// import update from "./commands/update/index";
import path from "path";
import { spawn, spawnSync } from "child_process";

import devOpsPluginCommands from "./commands/devops-plugin";
import pluginCommands from "./commands/plugin";
import prismaCommands from './commands/prisma';
const fsExtras = require("fs-extra");
import { cwd } from "process";
import { readFileSync } from "fs";


// load .env
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// added a new ENV variable in docker-compose.yml
// const isInsideDevContainer = (): boolean => {
//   return !!process.env.INSIDE_CONTAINER;
// };

const detectOSType = () => {
  switch (process.platform) {
    case 'win32': return 'Windows';
    case 'linux': return 'Linux';
    case 'darwin': return 'Mac';
    default: return 'UNKNOWN';
  }
};
export const isAGodspeedProject = () => {
  // verify .godspeed file, only then, it is a godspeed project
  try {
    readFileSync(path.join(cwd(), ".godspeed"))
  } catch (error) {
    console.log(`${chalk.yellow(cwd())} ${chalk.red('is not a Godspeed Framework project.')}`);
    console.log('\n', chalk.yellow('godspeed'), chalk.yellow('commands works inside godspeed project directory.'));
    return false;
  }

  let packageJSON;
  try {
    // @ts-ignore
    packageJSON = JSON.parse(readFileSync(path.join(cwd(), "package.json"), { encoding: 'utf-8' }));
  } catch (error) {
    console.log(`This (${chalk.yellow(cwd())})`, 'is not a Godspeed project.');
    console.log('\n', chalk.yellow('godspeed'), chalk.yellow('commands only work inside godspeed project directory.'));
    return false;
  }

  return true;
}

(async function main() {
  console.log(chalk.bold(chalk.green("\n~~~~~~ Godspeed CLI ~~~~~~\n")));
  if (detectOSType() === 'Windows') {
    console.log(chalk.yellow('Coming Soon! Support for Windows OS.'));
    console.log('If you would love to give it a try to our Alpha realease of Godspeed Framework. You can use these online cloud-development platform.');
    console.log(`1. CodeSandbox `);
    console.log(`2. Github Codespaces `)
  }

  const program = new Command();

  // @ts-ignore
  let { version, homepage } = require(path.join(__dirname, '../package.json'));

  // remove @godspeedsystems from the name
  program.name('Godspeed CLI').description('CLI tool for godspeed framework.').version(version);
  program.showHelpAfterError();
  program.showSuggestionAfterError(true);
  program.configureOutput({
    writeOut: (str) => {
      console.log(`${str}\n`);
      console.log(`For detailed documentation visit ${homepage}`);
      console.log(`\n`);
    },
    outputError: (str, write) => {
      write(chalk.red(str));
    },
  });

  program
    .command("create")
    .description("create a new godspeed project.")
    .argument("<projectName>", "name of the project.")
    // .option(
    //   "--from-template <projectTemplateName>",
    //   "create a project from a template."
    // )
    // .option("--from-example <exampleName>", "create a project from examples.")
    .action((projectName, options) => {
      create(projectName, options, version);
    });

  // program
  //   .command("update")
  //   .description(
  //     "Update existing godspeed project. (execute from project root folder)"
  //   )
  //   .action(async (options) => {
  //     if (await isAGodspeedProject()) {
  //       update(options, version);
  //     }
  //   });

  program
    .command("dev")
    .description("run godspeed development server.")
    .action(async () => {
      if (await isAGodspeedProject()) {
        spawn("npm", ["run", "dev"], {
          stdio: "inherit",
        });
      }
    });

  program
    .command("clean")
    .description(
      `clean the previous build.`
    )
    .action(async (options) => {
      if (await isAGodspeedProject()) {
        spawn("npm", ["run", "clean"], {
          stdio: "inherit",
        });
      }
    });

  program
    .command("build")
    .description("build the godspeed project.")
    .action(async (options) => {
      if (await isAGodspeedProject()) {
        spawn("npm", ["run", "build"], {
          stdio: "inherit",
        });
      }
    });


  program
    .command('devops-plugin')
    .addCommand(devOpsPluginCommands.add)
    .addCommand(devOpsPluginCommands.remove)
    .addCommand(devOpsPluginCommands.update)
    .description(
      `manage(add, remove, update) godspeed plugins for devops.`
    );


  program
    .command('plugin')
    .addCommand(pluginCommands.add)
    .addCommand(pluginCommands.remove)
    .addCommand(pluginCommands.update)
    .description(
      `manage(add, remove, update) eventsource and datasource plugins for godspeed.`
    );

  // bypass all conmmands to prisma CLI, except godspeed prepare
  if (process.argv[2] === 'prisma') {
    if (process.argv[3] !== 'prepare') {
      spawnSync('npx', ['prisma'].concat(process.argv.slice(3)))
    }
  }

  program
    .command('prisma')
    .description('proxy to prisma commands with some add-on commands to handle prisma datasources.')
    .addCommand(prismaCommands.prepare)

  program.parse();
})();