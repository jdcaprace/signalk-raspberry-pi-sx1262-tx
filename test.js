const spawner = require('child_process').spawn;

payload = "Message test!";

console.log('Data sent to pyhton script:', payload);

const python_process = spawner('python3', ['./tx.py', payload]);

python_process.stdout.on('data', (data) => {
    console.log('Data received from python script:', data.toString());
});