const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const { createApp } = require("./app");

const PORT = Number(process.env.PORT || 3000);

dotenv.config({ path: path.join(__dirname, ".env") });
const app = createApp();

for (const dir of ["uploads", "generated"]) {
  fs.mkdirSync(path.join(__dirname, dir), { recursive: true });
}

app.listen(PORT, () => {
  console.log(`Momentto rodando em http://localhost:${PORT}`);
});
