# ZK snark semaphore

# Setup

```
npm i && \
npm run bootstrap && \
npm run build
```

Download the circuits: (Note: u may need to install wget)
`./circuits/scripts/download_snarks.sh`

Then you need to use Node 11.14.0 for this or it wont work. Do not npm i in this folder

```
cd contracts && \
npm run compileSol
```

# Then to test

`npm run ganache`
then in another terminal tab enter cli-interface

```
cd ..
cd cli-interface
npm i
node index.js
```
