transactions = require '../model/transactions'
Channel = require('../model/channels').Channel
Q = require 'q'
logger = require 'winston'
authorisation = require './authorisation'
utils = require "../utils"

getChannelIDsArray = (channels) ->
  channelIDs = []
  for channel in channels
    channelIDs.push channel._id.toString()
  return channelIDs


# function to construct projection object
getProjectionObject = (filterRepresentation) ->
  switch filterRepresentation
    when "simpledetails"
      # view minimum required data for transaction details view
      return { "request.body": 0, "response.body": 0, "routes.request.body": 0, "routes.response.body": 0, "orchestrations.request.body": 0, "orchestrations.response.body": 0 }
    when "full"
      # view all transaction data
      return {}
    else
      # no filterRepresentation supplied - simple view
      # view minimum required data for transactions
      return { "request.body": 0, "request.headers": 0, "response.body": 0, "response.headers": 0, orchestrations: 0, routes: 0 }
  



###
# Retrieves the list of transactions
###
exports.getTransactions = ->
  try

    filtersObject = this.request.query

    #construct date range filter option
    if filtersObject.startDate and filtersObject.endDate
      filtersObject['request.timestamp'] = $gte: filtersObject.startDate, $lt: filtersObject.endDate

      #remove startDate/endDate from objects filter (Not part of filtering and will break filter)
      delete filtersObject.startDate
      delete filtersObject.endDate

    #get limit and page values
    filterLimit = filtersObject.filterLimit
    filterPage = filtersObject.filterPage
    filterRepresentation = filtersObject.filterRepresentation

    #remove limit/page/filterRepresentation values from filtersObject (Not apart of filtering and will break filter if present)
    delete filtersObject.filterLimit
    delete filtersObject.filterPage
    delete filtersObject.filterRepresentation

    #determine skip amount
    filterSkip = filterPage*filterLimit

    # Test if the user is authorised
    if not authorisation.inGroup 'admin', this.authenticated
      # if not an admin, restrict by transactions that this user can view
      channels = yield authorisation.getUserViewableChannels this.authenticated

      if not filtersObject.channelID
        filtersObject.channelID = $in: getChannelIDsArray channels

      # set 'filterRepresentation' to default if user isnt admin
      filterRepresentation = ''

    # get projection object
    projectionFiltersObject = getProjectionObject filterRepresentation

    # execute the query
    this.body = yield transactions.Transaction
      .find filtersObject, projectionFiltersObject
      .skip filterSkip
      .limit filterLimit
      .sort 'request.timestamp': -1
      .exec()

  catch e
    util.logAndSetResponse this, 'internal server error', "Could not retrieve transactions via the API: #{e}", 'error'

###
# Adds an transaction
###
exports.addTransaction = ->

  # Test if the user is authorised
  if not authorisation.inGroup 'admin', this.authenticated
    utils.logAndSetResponse this, 'forbidden', "User #{this.authenticated.email} is not an admin, API access to addTransaction denied.", 'info'
    return

  # Get the values to use
  transactionData = this.request.body
  tx = new transactions.Transaction transactionData

  try
    # Try to add the new transaction (Call the function that emits a promise and Koa will wait for the function to complete)
    yield Q.ninvoke tx, "save"
    this.status = 'created'
    logger.info "User #{this.authenticated.email} created transaction with id #{tx.id}"
  catch e
    util.logAndSetResponse this, 'internal server error', "Could not add a transaction via the API: #{e}", 'error'


###
# Retrieves the details for a specific transaction
###
exports.getTransactionById = (transactionId) ->
  # Get the values to use
  transactionId = unescape transactionId

  try
    filtersObject = this.request.query
    filterRepresentation = filtersObject.filterRepresentation

    #remove filterRepresentation values from filtersObject (Not apart of filtering and will break filter if present)
    delete filtersObject.filterRepresentation

    # set filterRepresentation to 'full' if not supplied
    if not filterRepresentation then filterRepresentation = 'full'

    # --------------Check if user has permission to view full content----------------- #
    # if user NOT admin, determine their representation privileges.
    if not authorisation.inGroup 'admin', this.authenticated
      # retrieve transaction channelID
      txChannelID = yield transactions.Transaction.findById(transactionId, channelID: 1, _id: 0).exec()
      if txChannelID?.length is 0
        this.body = "Could not find transaction with ID: #{transactionId}"
        this.status = 'not found'
        return
      else
        # assume user is not allowed to view all content - show only 'simpledetails'
        filterRepresentation = 'simpledetails'

        # get channel.txViewFullAcl information by channelID
        channel = yield Channel.findById(txChannelID.channelID, txViewFullAcl: 1, _id: 0).exec()

        # loop through user groups
        for group in this.authenticated.groups
          # if user role found in channel txViewFullAcl - user has access to view all content
          if channel.txViewFullAcl.indexOf(group) >= 0
            # update filterRepresentation object to be 'full' and allow all content
            filterRepresentation = 'full'
            break

    # --------------Check if user has permission to view full content----------------- #
    # get projection object
    projectionFiltersObject = getProjectionObject filterRepresentation

    result = yield transactions.Transaction.findById(transactionId, projectionFiltersObject).exec()

    # Test if the result if valid
    if result?.length is 0
      this.body = "Could not find transaction with ID: #{transactionId}"
      this.status = 'not found'
    # Test if the user is authorised
    else if not authorisation.inGroup 'admin', this.authenticated
      channels = yield authorisation.getUserViewableChannels this.authenticated
      if getChannelIDsArray(channels).indexOf(result.channelID.toString()) >= 0
        this.body = result
      else
        utils.logAndSetResponse this, 'forbidden', "User #{this.authenticated.email} is not authenticated to retrieve transaction #{transactionId}", 'info'
    else
      this.body = result

  catch e
    util.logAndSetResponse this, 'internal server error', "Could not add a transaction via the API: #{e}", 'error'


###
# Retrieves all transactions specified by clientId
###
exports.findTransactionByClientId = (clientId) ->
  clientId = unescape clientId

  try

    filtersObject = this.request.query
    filterRepresentation = filtersObject.filterRepresentation

    # get projection object
    projectionFiltersObject = getProjectionObject filterRepresentation

    filtersObject = {}
    filtersObject.clientID = clientId

    # Test if the user is authorised
    if not authorisation.inGroup 'admin', this.authenticated
      # if not an admin, restrict by transactions that this user can view
      channels = yield authorisation.getUserViewableChannels this.authenticated

      filtersObject.channelID = $in: getChannelIDsArray channels

      # set 'filterRepresentation' to default if user isnt admin
      filterRepresentation = ''

    # execute the query
    this.body = yield transactions.Transaction
      .find filtersObject, projectionFiltersObject
      .sort 'request.timestamp': -1
      .exec()
    
  catch e
    util.logAndSetResponse this, 'internal server error', "Could not add a transaction via the API: #{e}", 'error'


###
# Updates a transaction record specified by transactionId
###
exports.updateTransaction = (transactionId) ->

  # Test if the user is authorised
  if not authorisation.inGroup 'admin', this.authenticated
    utils.logAndSetResponse this, 'forbidden', "User #{this.authenticated.email} is not an admin, API access to updateTransaction denied.", 'info'
    return

  transactionId = unescape transactionId
  updates = this.request.body

  try
    yield transactions.Transaction.findByIdAndUpdate(transactionId, updates).exec()
    this.body = "Transaction with ID: #{transactionId} successfully updated"
    this.status = 'ok'
    logger.info "User #{this.authenticated.email} updated transaction with id #{transactionId}"
  catch e
    util.logAndSetResponse this, 'internal server error', "Could not update transaction via the API: #{e}", 'error'


###
#Removes a transaction
###
exports.removeTransaction = (transactionId) ->

  # Test if the user is authorised
  if not authorisation.inGroup 'admin', this.authenticated
    utils.logAndSetResponse this, 'forbidden', "User #{this.authenticated.email} is not an admin, API access to removeTransaction denied.", 'info'
    return

  # Get the values to use
  transactionId = unescape transactionId

  try
    yield transactions.Transaction.findByIdAndRemove(transactionId).exec()
    this.body = 'Transaction successfully deleted'
    this.status = 'ok'
    logger.info "User #{this.authenticated.email} removed transaction with id #{transactionId}"
  catch e
    util.logAndSetResponse this, 'internal server error', "Could not update transaction via the API: #{e}", 'error'
