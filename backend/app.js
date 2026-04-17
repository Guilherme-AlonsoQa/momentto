const express = require("express");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });

const orderRouter = require("./routes/order");
const pixRouter   = require("./routes/pix");

function createApp() {
  const app = express();
  const frontendDir = path.join(__dirname, "..", "frontend");

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use("/assets", express.static(path.join(frontendDir, "assets")));
  app.use("/templates", express.static(path.join(frontendDir, "templates")));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(frontendDir, "index.html"));
  });

  app.get("/pedido", (_req, res) => {
    res.sendFile(path.join(frontendDir, "pedido.html"));
  });

  app.use("/api/orders", orderRouter);
  app.use("/api/pix",    pixRouter);

  app.use((err, _req, res, _next) => {
    console.error(err);

    if (res.headersSent) {
      return;
    }

    res.status(err.statusCode || 500).json({
      ok: false,
      error: err.message || "Erro interno ao processar o pedido."
    });
  });

  return app;
}

module.exports = {
  createApp
};
