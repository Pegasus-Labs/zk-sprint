const inquirer = require('inquirer')

module.exports = {
  welcome: () => {
    const questions = [
      {
        name: 'welcome',
        type: 'list',
        message: 'What can I help you with today?',
        choices: [
          'Register',
          'Vote',
          'New Proposal',
          'End a Vote (admin only)',
          'Quit',
        ],
        validate: function (value) {
          if (value.length) {
            return true
          } else {
            return 'Please enter your name'
          }
        },
      },
    ]
    return inquirer.prompt(questions)
  },
  add_topic: () => {
    const questions = [
      {
        name: 'topic',
        type: 'input',
        message: 'What should the topic to vote on be?',
        validate: function (value) {
          if (value.length) {
            return true
          } else {
            return 'Please enter your name'
          }
        },
      },
    ]
    return inquirer.prompt(questions)
  },
  topics: (topics) => {
    const questions = [
      {
        name: 'topic',
        type: 'list',
        message: 'Choose a topic to vote on.',
        choices: topics,
        validate: function (value) {
          if (value.length) {
            return true
          } else {
            return 'Please enter your name'
          }
        },
      },
    ]
    return inquirer.prompt(questions)
  },
  get_vote: () => {
    const questions = [
      {
        name: 'vote',
        type: 'list',
        message: 'What do you want to vote?',
        choices: ['yes', 'no'],
        validate: function (value) {
          if (value.length) {
            return true
          } else {
            return 'Please enter your name'
          }
        },
      },
    ]
    return inquirer.prompt(questions)
  },
}
