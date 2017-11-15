/* eslint-env mocha */
/* eslint no-unused-expressions:0 */

import request from 'supertest'
import sinon from 'sinon'
import mongoose from 'mongoose'
import * as server from '../../src/server'
import * as tcpAdapter from '../../src/tcpAdapter'
import * as polling from '../../src/polling'
import { ChannelModelAPI } from '../../src/model/channels'
import { TransactionModelAPI } from '../../src/model/transactions'
import * as testUtils from '../utils'
import { promisify } from 'util'
import * as constants from '../constants'
import should from 'should'
import { ObjectId } from 'mongodb'
import { config } from '../../src/config'
import { ClientModelAPI } from '../../src/model/clients'

const { SERVER_PORTS } = constants
let sandbox = sinon.createSandbox()

describe('API Integration Tests', () => {
  const httpPortPlus40 = constants.PORT_START + 40
  const httpPortPlus41 = constants.PORT_START + 41
  describe('Channels REST Api testing', () => {
    const channel1 = {
      name: 'TestChannel1',
      urlPattern: 'test/sample',
      allow: ['PoC', 'Test1', 'Test2'],
      routes: [{
        name: 'test route',
        host: 'localhost',
        port: 9876,
        primary: true
      }
      ],
      txViewAcl: 'aGroup',
      updatedBy: {
        id: new ObjectId(),
        name: 'Test'
      }
    }

    const channel2 = {
      name: 'TestChannel2',
      urlPattern: 'test/sample',
      allow: ['PoC', 'Test1', 'Test2'],
      routes: [{
        name: 'test route',
        host: 'localhost',
        port: 9876,
        primary: true
      }
      ],
      txViewAcl: 'group1',
      updatedBy: {
        id: new ObjectId(),
        name: 'Test'
      }
    }

    let authDetails = {}

    before(async () => {
      await testUtils.setupTestUsers()
      await promisify(server.start)({ apiPort: SERVER_PORTS.apiPort, tcpHttpReceiverPort: SERVER_PORTS.tcpHttpReceiverPort })
      authDetails = await testUtils.getAuthDetails()
    })

    after(async () => {
      await Promise.all([
        TransactionModelAPI.remove(),
        ChannelModelAPI.remove(),
        testUtils.cleanupTestUsers(),
        promisify(server.stop)()
      ])
    })

    afterEach(async () => {
      await sandbox.restore()
    })

    beforeEach(async () => {
      await Promise.all([
        TransactionModelAPI.remove(),
        ChannelModelAPI.remove()
      ])
      const ch1 = await (new ChannelModelAPI(channel1)).save()
      channel1._id = ch1._id
      const ch2 = await (new ChannelModelAPI(channel2)).save()
      channel2._id = ch2._id
      sandbox.stub(tcpAdapter, 'notifyMasterToStartTCPServer')
      sandbox.stub(tcpAdapter, 'notifyMasterToStopTCPServer')
    })

    describe('*getChannels()', () => {
      it('should fetch all channels', async () => {
        const result = await request(constants.BASE_URL)
          .get('/channels')
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .expect(200)
        result.body.length.should.be.eql(2)
      })

      it('should only allow non root user to fetch channel that they are allowed to view', async () => {
        const result = await request(constants.BASE_URL)
          .get('/channels')
          .set('auth-username', testUtils.nonRootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .expect(200)
        result.body.length.should.be.eql(1)
        result.body[0].name.should.be.eql('TestChannel2')
      })
    })

    describe('*addChannel()', () => {
      it('should add a new channel', async () => {
        const newChannel = {
          name: 'NewChannel',
          urlPattern: 'test/sample',
          allow: ['PoC', 'Test1', 'Test2'],
          routes: [{
            name: 'test route',
            host: 'localhost',
            port: 9876,
            primary: true
          }]
        }
        await request(constants.BASE_URL)
          .post('/channels')
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(newChannel)
          .expect(201)
        const channel = await ChannelModelAPI.findOne({ name: 'NewChannel' })
        channel.should.have.property('urlPattern', 'test/sample')
        channel.allow.should.have.length(3)
      })

      it('should reject a channel without a name', async () => {
        const newChannel = {
          urlPattern: 'test/sample',
          allow: ['PoC', 'Test1', 'Test2'],
          routes: [{
            name: 'test route',
            host: 'localhost',
            port: 9876,
            primary: true
          }]
        }

        await request(constants.BASE_URL)
          .post('/channels')
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(newChannel)
          .expect(400)
      })

      it('should reject invalid channels with invalid pathTransform', async () => {
        const invalidChannel = {
          name: 'InvalidChannel',
          urlPattern: 'test/sample',
          allow: ['PoC', 'Test1', 'Test2'],
          routes: [{
            name: 'test route',
            host: 'localhost',
            pathTransform: 'invalid',
            port: 9876,
            primary: true
          }]
        }

        await request(constants.BASE_URL)
          .post('/channels')
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(invalidChannel)
          .expect(400)
      })

      it('should reject channels containing both path and pathTransform', async () => {
        const invalidChannel = {
          name: 'InvalidChannel',
          urlPattern: 'test/sample',
          allow: ['PoC', 'Test1', 'Test2'],
          routes: [{
            name: 'test route',
            host: 'localhost',
            path: '/target',
            pathTransform: 's/foo/bar',
            port: 9876,
            primary: true
          }]
        }

        await request(constants.BASE_URL)
          .post('/channels')
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(invalidChannel)
          .expect(400)
      })

      it('should not allow a non admin user to add a channel', async () => {
        const newChannel = {}

        await request(constants.BASE_URL)
          .post('/channels')
          .set('auth-username', testUtils.nonRootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(newChannel)
          .expect(403)
      })

      it('should notify master to startup TCP server if the new channel is of type "tcp"', async () => {
        const tcpChannel = {
          name: 'TCPTestChannel-Add',
          urlPattern: '/',
          allow: ['tcp'],
          type: 'tcp',
          tcpHost: '0.0.0.0',
          tcpPort: SERVER_PORTS.tcpPort,
          routes: [{
            name: 'TcpRoute',
            host: 'localhost',
            port: 9876,
            primary: true,
            type: 'tcp'
          }]
        }

        await request(constants.BASE_URL)
          .post('/channels')
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(tcpChannel)
          .expect(201)

        sinon.assert.calledOnce(tcpAdapter.notifyMasterToStartTCPServer)
      })

      it('should NOT notify master to startup TCP server if the new channel is of type "tcp" but is disabled', async () => {
        const tcpChannelDisabled = {
          name: 'TCPTestChannel-Add-Disabled',
          urlPattern: '/',
          allow: ['tcp'],
          type: 'tcp',
          tcpHost: '0.0.0.0',
          tcpPort: SERVER_PORTS.tcpPort,
          routes: [{
            name: 'TcpRoute',
            host: 'localhost',
            port: 9876,
            primary: true,
            type: 'tcp'
          }],
          status: 'disabled'
        }

        await request(constants.BASE_URL)
          .post('/channels')
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(tcpChannelDisabled)
          .expect(201)
        sinon.assert.notCalled(tcpAdapter.notifyMasterToStartTCPServer)
      })

      it('should register the channel with the polling service if of type "polling"', async () => {
        const pollChannel = {
          name: 'POLLINGTestChannel-Add',
          urlPattern: '/trigger',
          allow: ['polling'],
          type: 'polling',
          pollingSchedule: '5 * * * *',
          routes: [{
            name: 'PollRoute',
            host: 'localhost',
            port: 9876,
            primary: true
          }]
        }

        const spy = sinon.spy(polling, 'registerPollingChannel')

        await request(constants.BASE_URL)
          .post('/channels')
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(pollChannel)
          .expect(201)

        spy.restore()
        spy.calledOnce.should.be.true()
        spy.getCall(0).args[0].should.have.property('name', 'POLLINGTestChannel-Add')
        spy.getCall(0).args[0].should.have.property('urlPattern', '/trigger')
        spy.getCall(0).args[0].should.have.property('type', 'polling')
      })

      it('should NOT register the channel with the polling service if of type "polling" but is disabled', async () => {
        const pollChannelDisabled = {
          name: 'POLLINGTestChannel-Add-Disabled',
          urlPattern: '/trigger',
          allow: ['polling'],
          type: 'polling',
          pollingSchedule: '5 * * * *',
          routes: [{
            name: 'PollRoute',
            host: 'localhost',
            port: 9876,
            primary: true
          }],
          status: 'disabled'
        }

        const spy = sinon.spy(polling, 'registerPollingChannel')

        await request(constants.BASE_URL)
          .post('/channels')
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(pollChannelDisabled)
          .expect(201)
        spy.restore()
        spy.callCount.should.be.exactly(0)
      })

      it('should reject a channel without a primary route', async () => {
        const newChannel = {
          name: 'no-primary-route-test',
          urlPattern: 'test/sample',
          allow: ['PoC', 'Test1', 'Test2'],
          routes: [{
            name: 'test route',
            host: 'localhost',
            port: 9876
          }]
        }

        await request(constants.BASE_URL)
          .post('/channels')
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(newChannel)
          .expect(400)
      })

      it('should reject a channel with multiple primary routes', async () => {
        const newChannel = {
          name: 'mulitple-primary-route-test',
          urlPattern: 'test/sample',
          allow: ['PoC', 'Test1', 'Test2'],
          routes: [
            {
              name: 'test route',
              host: 'localhost',
              port: 9876,
              primary: true
            }, {
              name: 'test route 2',
              host: 'localhost',
              port: 9877,
              primary: true
            }]
        }

        await request(constants.BASE_URL)
          .post('/channels')
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(newChannel)
          .expect(400)
      })

      it('should accept a channel with one enabled primary route but multiple disabled primary routes', async () => {
        const newChannel = {
          name: 'disabled-primary-route-test',
          urlPattern: 'test/sample',
          allow: ['PoC', 'Test1', 'Test2'],
          routes: [
            {
              name: 'test route',
              host: 'localhost',
              port: 9876,
              primary: true
            }, {
              name: 'test route 2',
              host: 'localhost',
              port: 9877,
              primary: true,
              status: 'disabled'
            }]
        }

        await request(constants.BASE_URL)
          .post('/channels')
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(newChannel)
          .expect(201)
      })

      it('should reject a channel with a priority below 1', async () => {
        const newChannel = {
          name: 'Channel-Priority--1',
          urlPattern: 'test/sample',
          priority: -1,
          allow: ['PoC', 'Test1', 'Test2'],
          routes: [{
            name: 'test route',
            host: 'localhost',
            port: 9876,
            primary: true
          }]
        }

        await request(constants.BASE_URL)
          .post('/channels')
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(newChannel)
          .expect(400)
      })
    })

    describe('*getChannel(channelId)', () => {
      it('should fetch a specific channel by id', async () => {
        const res = await request(constants.BASE_URL)
          .get(`/channels/${channel1._id}`)
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .expect(200)
        res.body.should.have.property('name', 'TestChannel1')
        res.body.should.have.property('urlPattern', 'test/sample')
        res.body.allow.should.have.length(3)
      })

      it('should not allow a non admin user from fetching a channel they dont have access to by name', async () => {
        await request(constants.BASE_URL)
          .get(`/channels/${channel1._id}`)
          .set('auth-username', testUtils.nonRootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .expect(403)
      })

      it('should allow a non admin user to fetch a channel they have access to by name', async () => {
        const res = await request(constants.BASE_URL)
          .get(`/channels/${channel2._id}`)
          .set('auth-username', testUtils.nonRootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .expect(200)
        res.body.should.have.property('name', 'TestChannel2')
        res.body.should.have.property('urlPattern', 'test/sample')
        res.body.allow.should.have.length(3)
      })

      it('should return a 404 if that channel doesnt exist', async () => {
        await request(constants.BASE_URL)
          .get('/channels/999999999999999999999999')
          .set('auth-username', testUtils.nonRootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .expect(404)
      })
    })

    describe('getChannelAudits(channelId)', () => {
      let expectedPatches

      beforeEach(async () => {
        await ChannelModelAPI.Patches.remove().exec()
        const patches = await ChannelModelAPI.Patches.create([
          {
            ref: channel1._id,
            ops: [
              {
                value: 'before',
                path: '/name',
                op: 'add'
              }
            ],
            updatedBy: {
              id: new ObjectId(),
              name: 'Test'
            }
          },
          {
            ref: channel2._id,
            ops: [
              {
                value: 'nope',
                path: '/name',
                op: 'add'
              }
            ],
            updatedBy: {
              id: new ObjectId(),
              name: 'Test'
            }
          },
          {
            ref: channel1._id,
            ops: [
              {
                value: 'after',
                path: '/name',
                op: 'replace'
              }
            ],
            updatedBy: {
              id: new ObjectId(),
              name: 'Test'
            }
          }
        ])
        expectedPatches = patches.reverse().filter(patch => patch.ref.equals(channel1._id)).map(patch => {
          const convertedPatch = patch.toObject()
          convertedPatch._id = convertedPatch._id.toString()
          convertedPatch.ref = convertedPatch.ref.toString()
          convertedPatch.date = convertedPatch.date.toISOString()
          convertedPatch.updatedBy.id = convertedPatch.updatedBy.id.toString()
          return convertedPatch
        })
      })

      it('should return the patches for the correct channel', async () => {
        const res = await request(constants.BASE_URL)
          .get(`/channels/${channel1._id}/audits`)
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .expect(200)
        res.body.should.eql(expectedPatches)
      })

      it('should return an empty array when the channel does not exist', async () => {
        const res = await request(constants.BASE_URL)
          .get('/channels/59f6d57b07552f280271efac/audits')
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .expect(200)
        res.body.should.eql([])
      })
    })

    describe('*updateChannel(channelId)', () => {
      it('should update a specific channel by id', async () => {
        const updates = {
          _id: 'thisShouldBeIgnored',
          urlPattern: 'test/changed',
          allow: ['PoC', 'Test1', 'Test2', 'another'],
          routes: [{
            name: 'test route',
            host: 'localhost',
            port: 9876,
            primary: true
          },
          {
            name: 'test route2',
            host: 'localhost',
            port: 8899
          }]
        }

        await request(constants.BASE_URL)
          .put(`/channels/${channel1._id}`)
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(updates)
          .expect(200)
        const channel = await ChannelModelAPI.findOne({ name: 'TestChannel1' })
        channel.should.have.property('name', 'TestChannel1')
        channel.should.have.property('urlPattern', 'test/changed')
        channel.allow.should.have.length(4)
        channel.routes.should.have.length(2)
      })

      it('should not allow a non admin user to update a channel', async () => {
        const updates = {}
        await request(constants.BASE_URL)
          .put(`/channels/${channel1._id}`)
          .set('auth-username', testUtils.nonRootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(updates)
          .expect(403)
      })

      it('should notify master to startup a TCP server if the type is set to "tcp"', async () => {
        const httpChannel = new ChannelModelAPI({
          name: 'TestChannelForTCPUpdate',
          urlPattern: '/',
          allow: ['test'],
          routes: [{
            name: 'test route',
            host: 'localhost',
            port: 9876,
            primary: true
          }],
          txViewAcl: 'group1',
          updatedBy: {
            id: new ObjectId(),
            name: 'Test'
          }
        })

        const changeToTCP = {
          type: 'tcp',
          tcpHost: '0.0.0.0',
          tcpPort: 3601
        }

        await httpChannel.save()
        await request(constants.BASE_URL)
          .put(`/channels/${httpChannel._id}`)
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(changeToTCP)
          .expect(200)

        sinon.assert.calledOnce(tcpAdapter.notifyMasterToStartTCPServer)
      })

      it('should NOT notify master to startup a TCP server if the type is set to "tcp" but it is disabled', async () => {
        const httpChannel = new ChannelModelAPI({
          name: 'TestChannelForTCPUpdate-Disabled',
          urlPattern: '/',
          allow: ['test'],
          routes: [{
            name: 'test route',
            host: 'localhost',
            port: 9876,
            primary: true
          }],
          txViewAcl: 'group1',
          updatedBy: {
            id: new ObjectId(),
            name: 'Test'
          }
        })

        const changeToTCPDisabled = {
          type: 'tcp',
          tcpHost: '0.0.0.0',
          tcpPort: 3603,
          status: 'disabled'
        }

        await httpChannel.save()
        await request(constants.BASE_URL)
          .put(`/channels/${httpChannel._id}`)
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(changeToTCPDisabled)
          .expect(200)
        sinon.assert.notCalled(tcpAdapter.notifyMasterToStartTCPServer)
        sinon.assert.calledOnce(tcpAdapter.notifyMasterToStopTCPServer)
      })

      it('should register the updated channel with the polling service if of type "polling"', async () => {
        const pollChannel = new ChannelModelAPI({
          name: 'POLLINGTestChannel-Update',
          urlPattern: '/trigger',
          allow: ['polling'],
          type: 'polling',
          pollingSchedule: '5 * * * *',
          routes: [{
            name: 'PollRoute',
            host: 'localhost',
            port: 9876,
            primary: true
          }],
          updatedBy: {
            id: new ObjectId(),
            name: 'Test'
          }
        })

        const spy = sinon.spy(polling, 'registerPollingChannel')

        await pollChannel.save()
        await request(constants.BASE_URL)
          .put(`/channels/${pollChannel._id}`)
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(pollChannel)
          .expect(200)
        spy.restore()
        spy.calledOnce.should.be.true()
        spy.getCall(0).args[0].should.have.property('name', 'POLLINGTestChannel-Update')
        spy.getCall(0).args[0].should.have.property('urlPattern', '/trigger')
        spy.getCall(0).args[0].should.have.property('type', 'polling')
        spy.getCall(0).args[0].should.have.property('_id', pollChannel._id)
      })

      it('should NOT register the updated channel with the polling service if of type "polling" but it is disabled', async () => {
        const pollChannel = new ChannelModelAPI({
          name: 'POLLINGTestChannel-Update-Disabled',
          urlPattern: '/trigger',
          allow: ['polling'],
          type: 'polling',
          pollingSchedule: '5 * * * *',
          routes: [{
            name: 'PollRoute',
            host: 'localhost',
            port: 9876,
            primary: true
          }],
          status: 'disabled',
          updatedBy: {
            id: new ObjectId(),
            name: 'Test'
          }
        })

        const spy = sinon.spy(polling, 'registerPollingChannel')

        await pollChannel.save()
        await request(constants.BASE_URL)
          .put(`/channels/${pollChannel._id}`)
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(pollChannel)
          .expect(200)
        spy.restore()
        spy.callCount.should.be.exactly(0)
      })

      it('should reject an update with no primary routes', async () => {
        const updates = {
          urlPattern: 'test/changed',
          allow: ['PoC', 'Test1', 'Test2', 'another'],
          routes: [{
            name: 'test route',
            host: 'localhost',
            port: 9876
          },
          {
            name: 'test route2',
            host: 'localhost',
            port: 8899
          }]
        }

        await request(constants.BASE_URL)
          .put(`/channels/${channel1._id}`)
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(updates)
          .expect(400)
      })

      it('should reject an update with multiple primary routes', async () => {
        const updates = {
          urlPattern: 'test/changed',
          allow: ['PoC', 'Test1', 'Test2', 'another'],
          routes: [{
            name: 'test route',
            host: 'localhost',
            port: 9876,
            primary: true
          },
          {
            name: 'test route2',
            host: 'localhost',
            port: 8899,
            primary: true
          }]
        }

        await request(constants.BASE_URL)
          .put(`/channels/${channel1._id}`)
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(updates)
          .expect(400)
      })

      it('should accept an update with one primary route and multiple disabled primary routes', async () => {
        const updates = {
          urlPattern: 'test/changed',
          allow: ['PoC', 'Test1', 'Test2', 'another'],
          routes: [{
            name: 'test route',
            host: 'localhost',
            port: 9876,
            primary: true
          },
          {
            name: 'test route2',
            host: 'localhost',
            port: 8899,
            primary: true,
            status: 'disabled'
          }]
        }

        await request(constants.BASE_URL)
          .put(`/channels/${channel1._id}`)
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(updates)
          .expect(200)
      })

      it('should NOT update a channel with a priority below 1', async () => {
        const updates = {
          urlPattern: 'test/changed',
          priority: -1
        }

        await request(constants.BASE_URL)
          .put(`/channels/${channel1._id}`)
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .send(updates)
          .expect(400)
        const channel = await ChannelModelAPI.findOne({ name: 'TestChannel1' })
        channel.should.have.property('urlPattern', 'test/sample')
      })
    })

    describe('*removeChannel(channelId)', () => {
      it('should remove a specific channel by name', async () => {
        const trx = await TransactionModelAPI.find({ channelID: channel1._id })
        // there can't be any linked transactions
        trx.length.should.be.exactly(0)

        await request(constants.BASE_URL)
          .del(`/channels/${channel1._id}`)
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .expect(200)
        const channels = await ChannelModelAPI.find({ name: 'TestChannel1' })
        channels.should.have.length(0)
      })

      it('should only allow an admin user to remove a channel', async () => {
        await request(constants.BASE_URL)
          .del(`/channels/${channel1._id}`)
          .set('auth-username', testUtils.nonRootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .expect(403)
      })

      it('should remove polling schedule if the channel is of type "polling"', async () => {
        const pollChannel = new ChannelModelAPI({
          name: 'POLLINGTestChannel-Remove',
          urlPattern: '/trigger',
          allow: ['polling'],
          type: 'polling',
          pollingSchedule: '5 * * * *',
          routes: [{
            name: 'PollRoute',
            host: 'localhost',
            port: 9876,
            primary: true
          }],
          updatedBy: {
            id: new ObjectId(),
            name: 'Test'
          }
        })

        const spy = sinon.spy(polling, 'removePollingChannel')

        const trx = await TransactionModelAPI.find({ channelID: channel1._id })
        // there can't be any linked transactions
        trx.length.should.be.exactly(0)

        await pollChannel.save()
        await request(constants.BASE_URL)
          .del(`/channels/${pollChannel._id}`)
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .expect(200)
        spy.restore()
        spy.calledOnce.should.be.true()
        spy.getCall(0).args[0].should.have.property('name', 'POLLINGTestChannel-Remove')
        spy.getCall(0).args[0].should.have.property('_id', pollChannel._id)
      })

      it('should NOT remove a specific channel if any transactions are linked to it but mark the status as deleted', async () => {
        const trx = new TransactionModelAPI({
          clientID: channel1._id, // not really but anyway
          channelID: channel1._id,
          request: {
            path: '/test/remove',
            method: 'GET',
            timestamp: new Date()
          },
          status: 'Successful'
        })

        await trx.save()
        await request(constants.BASE_URL)
          .del(`/channels/${channel1._id}`)
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .expect(200)
        const channels = await ChannelModelAPI.find({ name: 'TestChannel1' })
        channels.should.have.length(1)
        should.exist(channels[0].status)
        channels[0].status.should.be.equal('deleted')
      })
    })

    describe('*manuallyPollChannel', () => {
      it('should manually poll a channel', async () => {
        await request(constants.BASE_URL)
          .post(`/channels/${channel1._id}/trigger`)
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .expect(200)
      })

      it('should reject a manually polled channel - channel not found', async () => {
        const invalidId = mongoose.Types.ObjectId('4eeeeeeeeeeeeeeeebbbbbb2')
        await request(constants.BASE_URL)
          .post(`/channels/${invalidId}/trigger`)
          .set('auth-username', testUtils.rootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .expect(404)
      })

      it('should not allow a non admin user from manually polling a channel they do not have access to', async () => {
        await request(constants.BASE_URL)
          .post(`/channels/${channel1._id}/trigger`)
          .set('auth-username', testUtils.nonRootUser.email)
          .set('auth-ts', authDetails.authTS)
          .set('auth-salt', authDetails.authSalt)
          .set('auth-token', authDetails.authToken)
          .expect(403)
      })
    })
  })

  describe('Channel priority tests', () => {
    let mockServer1 = null
    let mockServer2 = null

    const channel1 = new ChannelModelAPI({
      name: 'TEST DATA - Mock endpoint 1',
      urlPattern: '^/test/undefined/priority$',
      allow: ['PoC'],
      routes: [{
        name: 'test route',
        host: 'localhost',
        port: httpPortPlus40,
        primary: true
      }],
      updatedBy: {
        id: new ObjectId(),
        name: 'Test'
      }
    })

    const channel2 = new ChannelModelAPI({
      name: 'TEST DATA - Mock endpoint 2',
      urlPattern: '^/.*$',
      priority: 3,
      allow: ['PoC'],
      routes: [{
        name: 'test route',
        host: 'localhost',
        port: httpPortPlus41,
        primary: true
      }],
      updatedBy: {
        id: new ObjectId(),
        name: 'Test'
      }
    })

    const channel3 = new ChannelModelAPI({
      name: 'TEST DATA - Mock endpoint 3',
      urlPattern: '^/test/mock$',
      priority: 2,
      allow: ['PoC'],
      routes: [{
        name: 'test route',
        host: 'localhost',
        port: httpPortPlus40,
        primary: true
      }],
      updatedBy: {
        id: new ObjectId(),
        name: 'Test'
      }
    })

    before(async () => {
      config.authentication.enableMutualTLSAuthentication = false
      config.authentication.enableBasicAuthentication = true

      await Promise.all([
        channel1.save(),
        channel2.save(),
        channel3.save()
      ])

      const testAppDoc = {
        clientID: 'testApp',
        clientDomain: 'test-client.jembi.org',
        name: 'TEST Client',
        roles: [
          'OpenMRS_PoC',
          'PoC'
        ],
        passwordAlgorithm: 'sha512',
        passwordHash: '28dce3506eca8bb3d9d5a9390135236e8746f15ca2d8c86b8d8e653da954e9e3632bf9d85484ee6e9b28a3ada30eec89add42012b185bd9a4a36a07ce08ce2ea',
        passwordSalt: '1234567890',
        cert: ''
      }

      await new ClientModelAPI(testAppDoc).save()

      // Create mock endpoint to forward requests to
      mockServer1 = await testUtils.createMockHttpServer('target1', httpPortPlus41, 200)
      mockServer2 = await testUtils.createMockHttpServer('target2', httpPortPlus40, 200)
    })

    after(async () => {
      await Promise.all([
        ChannelModelAPI.remove({ name: 'TEST DATA - Mock endpoint 1' }),
        ChannelModelAPI.remove({ name: 'TEST DATA - Mock endpoint 2' }),
        ChannelModelAPI.remove({ name: 'TEST DATA - Mock endpoint 3' }),
        ChannelModelAPI.remove({ name: 'TEST DATA - Mock endpoint 4' }),
        ClientModelAPI.remove({ clientID: 'testApp' }),
        mockServer1.close(),
        mockServer2.close()
      ])
    })

    afterEach(async () => {
      await promisify(server.stop)()
    })

    it('should route to the channel with higher priority if multiple channels match a request', async () => {
      await promisify(server.start)({ httpPort: SERVER_PORTS.httpPort })
      const res = await request(constants.HTTP_BASE_URL)
        .get('/test/mock')
        .auth('testApp', 'password')
        .expect(200)
      res.text.should.be.exactly('target2') // should route to target2 via channel3
    })

    it('should treat a channel with an undefined priority with lowest priority', async () => {
      await promisify(server.start)({ httpPort: SERVER_PORTS.httpPort })
      const res = await request(constants.HTTP_BASE_URL)
        .get('/test/undefined/priority')
        .auth('testApp', 'password')
        .expect(200)
      res.text.should.be.exactly('target1') // should route to target1 via channel2
    })

    it('should deny access if multiple channels match but the top priority channel denies access', async () => {
      await new ChannelModelAPI({
        name: 'TEST DATA - Mock endpoint 4',
        urlPattern: '^/test/mock$',
        priority: 1,
        allow: ['something else'],
        routes: [{
          name: 'test route',
          host: 'localhost',
          port: httpPortPlus40,
          primary: true
        }],
        updatedBy: {
          id: new ObjectId(),
          name: 'Test'
        }
      }).save()

      await promisify(server.start)({ httpPort: SERVER_PORTS.httpPort })
      await request(constants.HTTP_BASE_URL)
        .get('/test/mock')
        .auth('testApp', 'password')
        .expect(401)
    })
  })
})