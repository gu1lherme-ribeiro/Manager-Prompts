// Pede a senha do MySQL sem eco no terminal, URL-encoda, e atualiza
// DATABASE_URL no .env. A senha NÃO aparece no stdout nem nos logs.
//
// Uso:  npm run db:set-password -- --user root --db manager_prompts
//       (defaults: user=root, host=localhost, port=3306, db=manager_prompts)

import readline from "node:readline";
import { Writable } from "node:stream";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
const envExamplePath = resolve(__dirname, "../.env.example");

function parseArgs(argv) {
  const out = { user: "root", host: "localhost", port: "3306", db: "manager_prompts" };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith("--") && argv[i + 1] !== undefined) {
      out[key.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}

async function promptSilent(question) {
  const muted = new Writable({
    write(chunk, encoding, cb) {
      if (!this.muted) process.stdout.write(chunk, encoding);
      cb();
    },
  });
  muted.muted = false;
  const rl = readline.createInterface({
    input: process.stdin,
    output: muted,
    terminal: true,
  });
  process.stdout.write(question);
  muted.muted = true;
  return new Promise((done) => {
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      done(answer);
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!existsSync(envPath)) {
    if (existsSync(envExamplePath)) {
      writeFileSync(envPath, readFileSync(envExamplePath, "utf8"));
      console.log("criado .env a partir de .env.example");
    } else {
      writeFileSync(envPath, "");
    }
  }

  const password = await promptSilent(`senha do MySQL para user "${args.user}": `);
  if (!password) {
    console.error("senha vazia — abortando.");
    process.exit(1);
  }

  const userEnc = encodeURIComponent(args.user);
  const passEnc = encodeURIComponent(password);
  const url = `mysql://${userEnc}:${passEnc}@${args.host}:${args.port}/${args.db}`;

  let env = readFileSync(envPath, "utf8");
  const line = `DATABASE_URL="${url}"`;
  if (/^DATABASE_URL=.*$/m.test(env)) {
    env = env.replace(/^DATABASE_URL=.*$/m, line);
  } else {
    if (env.length > 0 && !env.endsWith("\n")) env += "\n";
    env += line + "\n";
  }
  writeFileSync(envPath, env);

  console.log(
    `.env atualizado: DATABASE_URL aponta para ${args.user}@${args.host}:${args.port}/${args.db}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
