import { createAppServer } from "./app.js";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const { server, store, dbFile } = createAppServer();

await store.ensure();

server.listen(port, host, () => {
  console.log(`Douyin review studio running at http://${host}:${port}`);
  console.log(`SQLite database: ${dbFile}`);

  const bootstrapInfo = store.getBootstrapInfo();

  if (bootstrapInfo.seededAdmin) {
    console.log(`Admin username: ${bootstrapInfo.username}`);

    if (bootstrapInfo.usedDefaultPassword) {
      console.log("Admin password: ChangeMe123!");
    }
  }
});
