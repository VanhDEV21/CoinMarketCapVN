import express, { Application } from 'express';
import { connectToDatabase } from './config/ConnectDB';
import coinRoutes from './routes/coinRoutes';
import cors from 'cors';
import axios from 'axios';

const app: Application = express();

app.use(express.json()); 
app.use(cors());

connectToDatabase();


app.use('/api/coins', coinRoutes);

async function fetchAndStoreCoins() {
  axios.get('http://localhost:5000/api/coins/fetch-and-store')
    .then(response => {
      console.log('API fetch-and-store success:', response.data);
    })
    .catch(error => {
      console.error('Error fetching and storing coins:', error);
    });
}

fetchAndStoreCoins();

setInterval(() => {
  fetchAndStoreCoins();
}, 5 * 60 * 1000);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
