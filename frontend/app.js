import React, { useState, useEffect } from "react";
import { io } from "socket.io-client";
import axios from "axios";
import "./App.css";

const socket = io("http://localhost:3000");

function App() {
  const [stocks, setStocks] = useState({});
  const [portfolio, setPortfolio] = useState({ balance: 0, holdings: {} });

  useEffect(() => {
    socket.on("stockUpdate", (data) => {
      setStocks((prev) => ({ ...prev, [data.symbol]: data.price }));
    });

    socket.on("portfolioUpdate", (data) => {
      setPortfolio(data);
    });

    return () => socket.disconnect();
  }, []);

  const handleOrder = async (type, symbol, quantity) => {
    try {
      const response = await axios.post("http://localhost:3000/order", {
        username: "testUser",
        type,
        symbol,
        quantity: parseInt(quantity),
      });
      alert(response.data);
    } catch (error) {
      alert(error.response.data);
    }
  };

  return (
    <div className="App">
      <h1>Capital Market Trading System</h1>
      <div>
        <h2>Stocks</h2>
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Price</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(stocks).map(([symbol, price]) => (
              <tr key={symbol}>
                <td>{symbol}</td>
                <td>{price}</td>
                <td>
                  <button onClick={() => handleOrder("buy", symbol, 1)}>Buy</button>
                  <button onClick={() => handleOrder("sell", symbol, 1)}>Sell</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h2>Portfolio</h2>
        <p>Balance: ${portfolio.balance}</p>
        <ul>
          {Object.entries(portfolio.holdings).map(([symbol, quantity]) => (
            <li key={symbol}>
              {symbol}: {quantity} shares
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default App;
