'use strict'

import logger from 'winston'
import moment from 'moment'

import {ChannelModel, TransactionModel} from './model'
import {config} from './config'

config.bodyCull = config.get('bodyCull')

export function setupAgenda(agenda) {
  if (config.bodyCull == null) {
    return
  }
  agenda.define('transaction body culling', async (job, done) => {
    try {
      await cullBodies()
      done()
    } catch (err) {
      done(err)
    }
  })
  agenda.every(
    `${config.bodyCull.pollPeriodMins} minutes`,
    `transaction body culling`
  )
}

export async function cullBodies() {
  const channels = await ChannelModel.find({
    maxBodyAgeDays: {$exists: true}
  })
  await Promise.all(channels.map(channel => clearTransactions(channel)))
}

async function clearTransactions(channel) {
  const {maxBodyAgeDays, lastBodyCleared} = channel
  const maxAge = moment().subtract(maxBodyAgeDays, 'd').toDate()
  const query = {
    channelID: channel._id,
    'request.timestamp': {
      $lte: maxAge
    }
  }

  if (lastBodyCleared != null) {
    query['request.timestamp'].$gte = lastBodyCleared
  }

  channel.lastBodyCleared = Date.now()
  channel.updatedBy = {name: 'Cron'}
  await channel.save()
  const updateResp = await TransactionModel.updateMany(query, {
    $unset: {'request.body': '', 'response.body': ''}
  })
  if (updateResp.modifiedCount > 0) {
    logger.info(
      `Culled ${updateResp.modifiedCount} transactions for channel ${channel.name}`
    )
  }
}
