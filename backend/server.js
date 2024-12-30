require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const axios = require("axios");
const Redis = require("ioredis");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const redisClient = new Redis();

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Models
const User = mongoose.model("User", new mongoose.Schema({
  username: String,
  balance: Number,
  portfolio: { type: Map, of: Number },
}));

const Order = mongoose.model("Order", new mongoose.Schema({
  username: String,
  symbol: String,
  type: String, // "buy" or "sell"
  quantity: Number,
  price: Number,
  timestamp: { type: Date, default: Date.now },
}));

// Environment variables
const STOCK_API_URL = "https://www.alphavantage.co/query";
const API_KEY = process.env.STOCK_API_KEY;
const STOCK_SYMBOLS = ["AAPL", "GOOGL", "MSFT"];

// Fetch stock prices
async function fetchStockPrice(symbol) {
  try {
    const response = await axios.get(STOCK_API_URL, {
      params: {
        function: "TIME_SERIES_INTRADAY",
        symbol,
        interval: "1min",
        apikey: API_KEY,
      },
    });
    const data = response.data["Time Series (1min)"];
    if (!data) throw new Error("Invalid API response");

    const latestKey = Object.keys(data)[0];
    const latestPrice = parseFloat(data[latestKey]["1. open"]);
    return { symbol, price: latestPrice };
  } catch (error) {
    console.error(`Error fetching data for ${symbol}:`, error.message);
    return null;
  }
}

// Periodically update stock prices
setInterval(async () => {
  for (const symbol of STOCK_SYMBOLS) {
    const stockData = await fetchStockPrice(symbol);
    if (stockData) {
      await redisClient.set(symbol, JSON.stringify(stockData));
      io.emit("stockUpdate", stockData);
    }
  }
}, 60000);

// Order execution logic
async function executeOrder(order) {
  const stockData = await redisClient.get(order.symbol);
  if (!stockData) throw new Error("Stock data not available");

  const { price } = JSON.parse(stockData);
  const totalCost = price * order.quantity;

  const user = await User.findOne({ username: order.username });
  if (order.type === "buy" && user.balance < totalCost) {
    throw new Error("Insufficient balance");
  } else if (order.type === "buy") {
    user.balance -= totalCost;
    user.portfolio.set(order.symbol, (user.portfolio.get(order.symbol) || 0) + order.quantity);
  } else if (order.type === "sell") {
    const currentHoldings = user.portfolio.get(order.symbol) || 0;
    if (currentHoldings < order.quantity) {
      throw new Error("Insufficient holdings");
    }
    user.portfolio.set(order.symbol, currentHoldings - order.quantity);
    user.balance += totalCost;
  }
  await user.save();

  const newOrder = new Order(order);
  await newOrder.save();

  io.emit("portfolioUpdate", { username: user.username, balance: user.balance, portfolio: user.portfolio });
}

// API routes
app.use(express.json());

app.post("/order", async (req, res) => {
  try {
    const order = req.body;
    await executeOrder(order);
    res.status(200).send("Order executed successfully");
  } catch (error) {
    res.status(400).send(error.message);
  }
});

// Start server
server.listen(3000, () => console.log("Server running on http://localhost:3000"));
