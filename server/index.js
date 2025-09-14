import server from "./server.js";
import express from "express";
import path from "path";

const __dirname = path.resolve();

const PORT = process.env.PORT || 3001;

const app = express();

app.use(express.static(path.join(__dirname, "./dist")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "./dist/index.html"));
});

app.listen(PORT, () => {
  console.log(`App server started on port ${PORT}`);
});
