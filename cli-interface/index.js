const chalk = require('chalk')
const clear = require('clear')
const figlet = require('figlet')
const inquirer = require('./lib/inquirer')
const MiMC = require('../contracts/compiled/MiMC.json')
const Semaphore = require('../contracts/compiled/Semaphore.json')
const SemaphoreClient = require('../contracts/compiled/SemaphoreClient.json')
const {
  SnarkBigInt,
  genIdentity,
  genIdentityCommitment,
  genExternalNullifier,
  genWitness,
  genCircuit,
  genProof,
  genPublicSignals,
  verifyProof,
  SnarkProvingKey,
  SnarkVerifyingKey,
  parseVerifyingKeyJson,
  genBroadcastSignalParams,
  genSignalHash,
} = require('libsemaphore')
const etherlime = require('etherlime-lib')
const path = require('path')
const fs = require('fs')
const ethers = require('ethers')
const CLI = require('clui')
const Spinner = CLI.Spinner

const genTestAccounts = (num, mnemonic) => {
  let accounts = []

  for (let i = 0; i < num; i++) {
    const p = `m/44'/60'/${i}'/0/0`
    const wallet = ethers.Wallet.fromMnemonic(mnemonic, p)
    accounts.push(wallet)
  }

  return accounts
}
const NUM_LEVELS = 20
let nullifier_start = 1111
const FIRST_EXTERNAL_NULLIFIER = 0
const circuitPath = path.join(__dirname, '../circuits/build/circuit.json')
const provingKeyPath = path.join(__dirname, '../circuits/build/proving_key.bin')
const verifyingKeyPath = path.join(
  __dirname,
  '../circuits/build/verification_key.json',
)
const config = {
  url: 'http://localhost:8545',
  chainId: 1234,
  mnemonic:
    'candy maple cake sugar pudding cream honey rich smooth crumble sweet treat',
}
const cirDef = JSON.parse(fs.readFileSync(circuitPath).toString())
const provingKey = fs.readFileSync(provingKeyPath)
const verifyingKey = parseVerifyingKeyJson(
  fs.readFileSync(verifyingKeyPath).toString(),
)
const circuit = genCircuit(cirDef)

const accounts = genTestAccounts(2, config.mnemonic)
let semaphoreContract
let semaphoreClientContract
let mimcContract
let insertedIdentityCommitments = []
let myIdentity
let topicToNullifierId = {}

let deployer

// start of functions

const deploy = async () => {
  const status = new Spinner('Deploying...')
  status.start()

  deployer = new etherlime.JSONRPCPrivateKeyDeployer(
    accounts[0].privateKey,
    config.url,
    {
      gasLimit: 8800000,
      chainId: config.chainId,
    },
  )
  status.message('Deploying MiMC')

  mimcContract = await deployer.deploy(MiMC, {})
  const libraries = {
    MiMC: mimcContract.contractAddress,
  }

  status.message('Deploying Semaphore')
  semaphoreContract = await deployer.deploy(
    Semaphore,
    libraries,
    NUM_LEVELS,
    FIRST_EXTERNAL_NULLIFIER,
  )

  status.message('Deploying Semaphore Client')
  semaphoreClientContract = await deployer.deploy(
    SemaphoreClient,
    {},
    semaphoreContract.contractAddress,
  )

  status.message(
    'Transferring ownership of the Semaphore contract to the Semaphore Client',
  )
  const tx = await semaphoreContract.transferOwnership(
    semaphoreClientContract.contractAddress,
  )
  await tx.wait()
  status.stop()
  console.log('Deploy Successful')
}

const createNewUser = async () => {
  const status = new Spinner('Authenticating you, please wait...')
  status.start()
  const identity = genIdentity()
  const identityCommitment = genIdentityCommitment(identity)
  const tx = await semaphoreClientContract.insertIdentityAsClient(
    identityCommitment.toString(),
  )
  await tx.wait()
  myIdentity = identity
  insertedIdentityCommitments.push('0x' + identityCommitment.toString(16))
  status.stop()
  console.log('Successfully Authenticated!')
}

const addTopic = async (topic) => {
  const nullifierNum = nullifier_start.toString()
  const status = new Spinner('Creating new Vote...')
  status.start()
  const nullifier = genExternalNullifier(nullifierNum)
  console.log('Adding new topic')
  const tx = await semaphoreClientContract.addExternalNullifier(
    nullifier,
    topic,
    { gasLimit: 200000 },
  )
  const receipt = await tx.wait()
  const isActive = await semaphoreContract.isExternalNullifierActive(
    nullifierNum,
  )
  topicToNullifierId[topic] = nullifier
  console.log('Topic: ' + topic + ' status: ' + isActive)
  status.stop()
  nullifier_start += 1
}
// and tell u the results
const endVote = async (topic) => {
  const status = new Spinner('Ending vote, and getting result...')
  status.start()
  const external_nullifier = topicToNullifierId[topic]

  const results = await semaphoreClientContract.getVoteCounts(
    external_nullifier,
  )
  const yesVotes = results.filter((obj) => obj).length
  const noVotes = results.length - yesVotes
  const resultString = yesVotes < noVotes ? 'does not pass.' : 'passes!'
  console.info('Yes Votes: ' + yesVotes)
  console.info('No Votes: ' + noVotes)
  console.info('The proposal ' + resultString)
  const tx = await semaphoreClientContract.deactivateExternalNullifier(
    external_nullifier,
    { gasLimit: 100000 },
  )
  await tx.wait()
  delete topicToNullifierId[topic]
  status.stop()
}

const sendVote = async (vote, topic) => {
  const status = new Spinner('Sending Vote...')
  status.start()
  try {
    const external_nullifier = topicToNullifierId[topic]
    const leaves = await semaphoreClientContract.getIdentityCommitments()
    const result = await genWitness(
      vote,
      circuit,
      myIdentity,
      leaves,
      NUM_LEVELS,
      external_nullifier,
    )

    proof = await genProof(result.witness, provingKey)
    publicSignals = genPublicSignals(result.witness, circuit)
    params = genBroadcastSignalParams(result, proof, publicSignals)
    const tx = await semaphoreClientContract.broadcastSignal(
      ethers.utils.toUtf8Bytes(vote),
      params.proof,
      params.root,
      params.nullifiersHash,
      external_nullifier,
      { gasLimit: 1000000 },
    )
    const receipt = await tx.wait()
    console.log('Vote Recorded')
  } catch (e) {
    console.error('Vote Failed: You already voted for this proposal')
  }
  status.stop()
}

const run = async () => {
  console.log(
    chalk.cyan(figlet.textSync('ZK Voting', { horizontalLayout: 'full' })),
  )
  await deploy()
  let credentials = await inquirer.welcome()
  while (true) {
    if (credentials.welcome == 'Register') {
      if (myIdentity) {
        console.log('Already Registered!')
      } else {
        await createNewUser()
      }
    } else if (credentials.welcome == 'New Proposal') {
      const newTopic = await inquirer.add_topic()
      await addTopic(newTopic.topic)
    } else if (credentials.welcome == 'Vote') {
      if (!myIdentity) {
        console.error('You must be registered to vote')
      } else if (Object.keys(topicToNullifierId).length == 0) {
        console.log('No topics to vote on yet')
      } else {
        const topics = await inquirer.topics(Object.keys(topicToNullifierId))
        const selected_topic = topics.topic
        const vote = await inquirer.get_vote()
        await sendVote(vote.vote, selected_topic)
      }
    } else if (credentials.welcome == 'End a Vote (admin only)') {
      if (Object.keys(topicToNullifierId).length == 0) {
        console.log('No active votes')
      } else {
        const topics = await inquirer.topics(Object.keys(topicToNullifierId))
        const selected_topic = topics.topic
        await endVote(selected_topic)
      }
    } else {
      break
    }
    credentials = await inquirer.welcome()
  }
}

run()
