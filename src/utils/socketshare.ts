import { readdir, readFile, writeFile, stat } from "fs/promises";
import { cwd } from "process";
import express from "express";
import http from "http";
import cors from "cors";
import chalk from "chalk";
import { Server as SocketIOServer } from "socket.io";
import { isAGodspeedProject } from ".."; // Adjust this import path as needed
import create from "../commands/create/index"; // Adjust this import path as needed
import { spawnSync, SpawnSyncOptionsWithStringEncoding } from "child_process";
import { spawn } from "child_process";
import nodemon from "nodemon"; // Import nodemon to manage the process
import path from "path";

const version = "1.0.0"; // Replace with the actual version if necessary

// interface FileStructure {
//   name: string;
//   path: string;
//   type: "file" | "directory";
//   content?: string; // Optional property for file content
//   children?: FileStructure[]; // Optional property for directories
// }

const setupSocketServer = async (port: any) => {
  const app = express();

  app.use(
    cors({
      origin: "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    })
  );

  const server = http.createServer(app);
  const socketServer = new SocketIOServer(server, {
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  interface FileStructure {
    name: string;
    path: string;
    content: string;
  }


  // Function to get the folder structure with paths relative to the cwd
  const getFolderStructure = async (dir: string): Promise<FileStructure[]> => {
    let structure: FileStructure[] = [];
    const cwd = process.cwd(); // Set the current working directory
    const rootFolderName = path.basename(dir); // Extract the root folder name
    const traverseDirectory = async (dir: string) => {
      try {
        const stats = await stat(dir);
        if (!stats.isDirectory()) {
          throw new Error(`${dir} is not a directory`);
        }

        const files = await readdir(dir, { withFileTypes: true });
        for (const file of files) {
          const fullPath = path.join(dir, file.name);

          // Ignore specific directories
          if (["node_modules", ".template", ".vscode"].includes(file.name)) {
            continue;
          }

          if (file.isDirectory()) {
            await traverseDirectory(fullPath); // Recursively process directories
          } else {
            const content = await readFile(fullPath, "utf-8");
            const relativePath = path.join(rootFolderName, path.relative(cwd, fullPath)); // Include root folder name in path
            structure.push({
              name: file.name,
              path: relativePath, // Store only the relative path
              content: content,
            });
          }
        }
      } catch (error) {
        console.error("Error reading directory:", error);
      }
    };

    await traverseDirectory(dir);
    return structure;
  };

  socketServer.on("connection", async (socket: any) => {
    const currentWorkingDirectory = cwd();
    socket.emit("cwd", currentWorkingDirectory);

    try {
      const folderStructure = await getFolderStructure(currentWorkingDirectory);
      socket.emit("fileList", folderStructure);
    } catch (error) {
      socket.emit("error", "Could not read folder structure");
    }

    // Handle file updates
    socket.on("file-update", async ({ path, content }: any) => {
      try {
        await writeFile(path, content, "utf-8");
        socket.emit("file-saved", cwd()); // Emit the saved file path
      } catch (error: any) {
        socket.emit("file-update-error", { path, error: error.message });
      }
    });

    // Request folder structure
    socket.on(
      "request-folder-structure",
      async (currentWorkingDirectory: any) => {
        try {
          const folderStructure = await getFolderStructure(
            currentWorkingDirectory
          );
          socket.emit("fileList", folderStructure);
        } catch (error) {
          socket.emit("error", "Could not read folder structure");
        }
      }
    );
    // Add these imports at the top

    // Inside your socket server setup
    socket.on("restart-nodemon", () => {
      console.log("Restarting nodemon...");

      // Kill the existing nodemon process
      nodemon.emit("quit"); // Emit quit signal to nodemon
      nodemon.on("exit", () => {
        // Restart nodemon after it exits
        nodemon({
          script: "./src/index.ts", // Replace with your main script
          watch: ["src"], // Watch these directories/files
          ext: "ts,js,yaml,json", // Watch these extensions
          exec: "ts-node -r dotenv", // Command to run
        });

        // Emit a message back to the client
        socket.emit("nodemon-restarted", "Nodemon has been restarted.");
      });
    });

    const handleCommand = (command: string, projectPath: string) => {
      // Change the current working directory to the project path
      try {
        process.chdir(projectPath);
        console.log(`Changed directory to: ${projectPath}`);
      } catch (error) {
        console.error("Error changing directory:", error);
        return; // Exit if the directory change fails
      }

      // Check if it's a Godspeed project
      if (isAGodspeedProject()) {
        const spawnOptions: SpawnSyncOptionsWithStringEncoding = {
          stdio: ["inherit", "inherit", "inherit"], // Use array for stdio options
          encoding: "utf8", // Specify the encoding
          env: {
            NODE_ENV: command === "serve" ? "production" : process.env.NODE_ENV,
            ...process.env,
          },
        };

        switch (command) {
          case "serve":
            console.log("Serve command received.");
            spawnSync("npm", ["run", "serve"], spawnOptions);
            break;
          case "dev":
            console.log("Dev command received.");
            spawnSync("npm", ["run", "dev"], spawnOptions);
            break;
          default:
            console.error("Unknown command received:", command);
        }
      } else {
        console.error("Not a Godspeed project.");
      }
    };

    socket.on("go-to-project", async (projectName: any) => {
      const newPath = `${currentWorkingDirectory}/${projectName}`; // Adjust this path as needed
      try {
        const folderStructure = await getFolderStructure(newPath);
        socket.emit("fileList", folderStructure);
        socket.emit("cwd", newPath); // Emit the new cwd

        // Optionally, you can run the command after changing directories
        // handleCommand("serve", newPath); // Uncomment to run "serve" command automatically
      } catch (error) {
        socket.emit("error", "Could not read folder structure of the project.");
      }
    });

    const projectExistsInCwd = async (projectName: any) => {
      try {
        const files = await readdir(cwd(), { withFileTypes: true });
        return files.some(
          (file) => file.isDirectory() && file.name === projectName
        );
      } catch (error) {
        console.error("Error reading current working directory:", error);
        return false;
      }
    };

    // Listen for 'serve' command from the frontend
    socket.on("serve", async (projectName: any) => {
      const projectPath =
        projectName && (await projectExistsInCwd(projectName))
          ? `${currentWorkingDirectory}/${projectName}`
          : cwd();

      handleCommand("serve", projectPath);
    });

    // Listen for 'dev' command from the frontend
    socket.on("dev", async (projectName: any) => {
      const projectPath =
        projectName && (await projectExistsInCwd(projectName))
          ? `${currentWorkingDirectory}/${projectName}`
          : cwd();

      // console.log("path", projectPath);

      handleCommand("dev", projectPath);
    });

    // Handle project creation
    socket.on("create", async (projectName: any) => {
      console.log(`Create command received. Project Name: ${projectName}`);
      try {
        await create(projectName, {}, version); // Ensure 'create' returns a promise
        socket.emit("create-success", projectName); // Emit success message
      } catch (error: any) {
        console.error("Error creating project:", error);
        socket.emit("create-error", error.message); // Emit error message
      }
    });

    socket.on("disconnect", () => {
      console.log(`${chalk.red("Client disconnected:")} ${socket.id}`);
    });
  });

  server.listen(port, () => {
    const serverUrl = `http://localhost:${port}`;
    const encodedServerUrl = Buffer.from(serverUrl).toString("base64");
    const connectUrl = `http://localhost:3000/?serverUrl=${encodedServerUrl}`;
    // console.log(`Connect URL: ${connectUrl}`);
    console.log("your files are exported succesfully check godspeed-web");
  });
};

export default setupSocketServer;
