import axios from "axios";

async function fetchDex(){
    return axios.get('https://pro-api.coinmarketcap.com/v4/dex/pairs/quotes/latest', {
        headers: {
            'X-CMC_PRO_API_KEY': '73feb218-7d95-459b-a40b-5f726d5c9c01',  
            'Accept': 'application/json',
        },
        params: {},
    })
    .then(response => {
        console.log('DEX fetch success:', response.data);
    })
    .catch(error => {
        console.error('Error fetching DEX data:', error);
    });
}
fetchDex();