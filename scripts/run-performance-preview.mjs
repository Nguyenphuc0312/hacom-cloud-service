import { spawn } from "node:child_process";

const run = (command) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, {
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        VITE_CHAT_PERF_DEBUG: "true",
      },
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} failed with exit code ${code ?? 1}`));
    });
  });

await run("npm run build:gate");

const preview = spawn("npm run preview -- --host 127.0.0.1 --port 4174", {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    VITE_CHAT_PERF_DEBUG: "true",
  },
});

preview.on("close", (code) => {
  process.exit(code ?? 0);
});
