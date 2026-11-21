import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import path from "path";
console.log("Starting db...");
const db = new PGlite(path.resolve('./pg-data'));
const pgServer = new PGLiteSocketServer({ db, port: 5433, host: "0.0.0.0" });
pgServer.start().then(() => {
  console.log("Started on 5433");
  setTimeout(() => process.exit(0), 1000);
}).catch(console.error);
