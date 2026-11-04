/**
 * Test of basic functionality
 *
 */

const CanUsbCom = require('..');
const chai = require('chai');
const expect = chai.expect;
// Adds .should to all objects (used as can.should.emit())
chai.should();
chai.use(require('chai-events'));

const MockBinding = require('./MockBinding');


const { Duplex } = require('stream');


// Define a simple stream to send packet(s)
class SendStream extends Duplex {

  constructor() {
    super({ objectMode: true });
  }

  _read() {}

  _write(chunk, encoding, cb) {
    // increase the ID by one, just for giggles
    chunk.id++;

    this.push(chunk);
    cb();
  }

}

// Define a simple stream to receive packets
class ReceiveStream extends Duplex {

  constructor() {
    super({ objectMode: true });
  }

  _read() {}


  _write(chunk, encoding, cb) {
    // reduce the ID by one, just for giggles
    chunk.id--;

    this.push(chunk);
    cb();
  }

}



describe('List available devices', () => {

  it('should be at least one device', async () => {

    let can = new CanUsbCom({
      canRate: 250000,
      Binding: MockBinding,
    });

    let result = await can.list();

    expect(result).to.be.an('array');
    expect(result.length).to.be.gt(0);

    result.forEach((port) => {

      expect(port).to.be.an('object');

      expect(port.path).to.exist;
      expect(port.vendorId).to.exist;
      expect(port.productId).to.exist;
      expect(port.vendorId).to.eq('0403');
      expect(port.productId).to.eq('6001');

    });

  });
});


describe('Send a Message', () => {

  let can = null;

  // before all tests in this block, get an open port
  before(async () => {

    can = new CanUsbCom({
      canRate: 250000,
      Binding: MockBinding,
      bindingOptions: {

        packetcb: function(/* port, packet */) {
          //console.log('packetcb', packet);
        },
      }
    });

    let result = await can.list();

    let p = can.should.emit('open', { timeout: 100 });

    can.open(result[0].path);

    return p;
  })

  it('should send a message with standard identifier', async () => {

    let p = can.should.not.emit('error', { timeout: 100 });

    // mainly we are checking that the write does not throw or error

    can.write({
      id: 0x100,
      ext: false,
      buf: []
    });
    can.write({
      id: 0x101,
      ext: false,
      buf: [1]
    });
    can.write({
      id: 0x102,
      ext: false,
      buf: [1, 2]
    });
    can.write({
      id: 0x103,
      ext: false,
      buf: [1, 2, 3]
    });
    can.write({
      id: 0x104,
      ext: false,
      buf: [1, 2, 3, 4, 5]
    });
    can.write({
      id: 0x105,
      ext: false,
      buf: [1, 2, 3, 4, 5, 6]
    });
    can.write({
      id: 0x106,
      ext: false,
      buf: [1, 2, 3, 4, 5, 6, 7]
    });
    can.write({
      id: 0x107,
      ext: false,
      buf: [1, 2, 3, 4, 5, 6, 7, 8]
    });

    await can.drain();


    // the serialport stream exposes the binding's open port object as .port
    expect(can.port.port.txPackets.length).eq(8);
    return p;

  });

  it('should emit a write event', async () => {

    let p = can.should.emit('write', { timeout: 100 });

    can.write({
      id: 0x100,
      ext: false,
      buf: []
    });

    return p;
  });


  // after all tests in this block
  after(async () => {
    await can.close();
  })
});


describe('Receive a Message', () => {

  let can = null;

  // before all tests in this block, get an open port
  before(async () => {

    // set and keep for later tests
    can = new CanUsbCom({
      canRate: 250000,
      Binding: MockBinding,
      bindingOptions: {
        packetcb: function(/* port, packet */) {

        },
      }

    });

    let result = await can.list();

    let p = can.should.emit('open', { timeout: 100 });

    can.open(result[0].path);

    return p;
  })


  it('should receive an extended message', (done) => {

    can.once('data', (msg) => {

      expect(msg).to.be.an('object');

      expect(msg.id).to.exist;
      expect(msg.ext).to.exist;
      expect(msg.buf).to.exist;
      expect(msg.id).to.be.eq(0x10EF8081);
      expect(msg.ext).to.be.eq(true);
      expect(msg.buf).to.deep.eq(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));

      done();

    });

    // here we simulate a receipt of a message thru the serial port
    // we could also send a packet and loop it back
    //
    can._onData(Buffer.from(':X10EF8081N0102030405060708;'));

  });

  it('should receive a standard message', (done) => {

    can.once('data', (msg) => {

      expect(msg).to.be.an('object');

      expect(msg.id).to.exist;
      expect(msg.ext).to.exist;
      expect(msg.buf).to.exist;
      expect(msg.id).to.be.eq(0x100);
      expect(msg.ext).to.be.eq(false);
      expect(msg.buf).to.deep.eq(Buffer.from([8, 7, 6, 5, 4, 3, 2, 1]));

      done();

    });

    // here we simulate a receipt of a message thru the serial port
    // we could also send a packet and loop it back
    can._onData(Buffer.from(':S100N0807060504030201;'));

  });

  // after all tests in this block
  after(async () => {

    await can.close();

  })
});


describe('Loopback Mode', () => {

  let can = null;

  // before all tests in this block, get an open port
  before(async () => {

    // set and keep for later tests
    can = new CanUsbCom({
      loopback: true,
      canRate: 250000,
      Binding: MockBinding,
      bindingOptions: {

      }

    });

    let result = await can.list();

    let p = can.should.emit('open', { timeout: 100 });

    can.open(result[0].path);

    return p;
  })


  it('should loop back a packet', (done) => {

    // because we opened the port in loopback mode, the same
    // message shoud come out
    can.once('data', (msg) => {

      expect(msg).to.be.an('object');

      expect(msg.id).to.exist;
      expect(msg.ext).to.exist;
      expect(msg.buf).to.exist;
      expect(msg.buf).to.be.instanceof(Buffer)
      expect(msg.id).to.be.eq(0x100);
      expect(msg.ext).to.be.eq(false);
      expect(msg.buf).to.deep.eq(Buffer.from([]));

      done();
    });

    can.write({
      id: 0x100,
      ext: false,
      buf: []
    });

  });

  // after all tests in this block
  after(async () => {

    await can.close();

  })
});


describe('Implement a standard stream interface', () => {

  let can = null;

  let sender = new SendStream();
  let receiver = new ReceiveStream();

  // before all tests in this block, get an open port
  before(async () => {

    // set and keep for later tests
    can = new CanUsbCom({
      canRate: 250000,
      Binding: MockBinding,
      bindingOptions: {

      }

    });
    can.pipe(receiver);
    sender.pipe(can);

    let result = await can.list();

    let p = can.should.emit('open', { timeout: 100 });

    can.open(result[0].path);

    return p;
  })


  it('should send a packet', async () => {

    let p = can.should.emit('write');

    sender.write({
      id: 0x100,
      ext: false,
      buf: [1, 2, 3, 4]
    });

    return p;


  });

  it('should receive a message', async () => {

    let p = receiver.should.emit('data');

    // here we simulate a receipt of a message thru the serial port

    can._onData(Buffer.from(':S100N0102030405060708;'));

    return p;
  });

  // after all tests in this block
  after(async () => {

    await can.close();


  })
});


describe('Status', () => {

  const CLOSED = { port: null, connection: 'closed', state: null, bitrate: null };

  // Creates an instance that records its status events, and opens it
  async function openCan() {
    let can = new CanUsbCom({
      canRate: 250000,
      Binding: MockBinding,
    });
    can.statusEvents = [];
    can.on('status', (status) => can.statusEvents.push(status));

    let result = await can.list();
    await can.open(result[0].path);
    return can;
  }

  it('should report a closed port before it is opened', async () => {

    let can = new CanUsbCom({ Binding: MockBinding });

    expect(await can.status()).to.deep.eq(CLOSED);
  });

  it('should report and emit the status when the port is opened and closed', async () => {

    let can = await openCan();

    let status = await can.status();
    expect(status).to.deep.eq({
      port: '/dev/MOCK', connection: 'connected', state: null, bitrate: 250000,
    });
    expect(can.statusEvents).to.deep.eq([status]);

    can.close();

    expect(await can.status()).to.deep.eq(CLOSED);
    expect(can.statusEvents).to.deep.eq([status, CLOSED]);
  });

  it('should report a disconnected adapter until the port is closed', async () => {

    let can = await openCan();

    let p = new Promise((resolve) => can.once('status', resolve));
    can.port.port.disconnect();
    let status = await p;

    expect(status).to.deep.eq({
      port: '/dev/MOCK', connection: 'disconnected', state: null, bitrate: 250000,
    });
    expect(await can.status()).to.deep.eq(status);
    expect(can.isConnected()).to.not.be.ok;

    can.close();

    expect(await can.status()).to.deep.eq(CLOSED);
    expect(can.statusEvents[can.statusEvents.length - 1]).to.deep.eq(CLOSED);
  });
});


describe('Error statistics', () => {

  it('should count frames sent and received, and report the rest as unknown', async () => {

    let can = new CanUsbCom({ canRate: 250000, Binding: MockBinding });

    let stats = await can.errorStats();
    expect(stats.since).to.eq(null);
    expect(stats.txFrames).to.eq(0);

    let result = await can.list();
    await can.open(result[0].path);

    can.write({ id: 0x100, ext: false, buf: [1] });
    can.write({ id: 0x101, ext: false, buf: [] });
    let p = new Promise((resolve) => can.once('data', resolve));
    can._onData(Buffer.from(':S200N01;'));
    await p;

    stats = await can.errorStats();
    expect(stats).to.have.all.keys('since', 'txFrames', 'rxFrames', 'errorFrames',
      'errorPercent', 'errors', 'arbitrationLost', 'overruns', 'busOff', 'state',
      'txErrorCounter', 'rxErrorCounter');
    expect(stats.since).to.be.instanceof(Date);
    expect(stats.txFrames).to.eq(2);
    expect(stats.rxFrames).to.eq(1);
    for (let key of ['errorFrames', 'errorPercent', 'arbitrationLost', 'overruns',
      'busOff', 'state', 'txErrorCounter', 'rxErrorCounter']) {
      expect(stats[key], key).to.eq(null);
    }
    expect(Object.values(stats.errors).every((v) => v === null)).to.eq(true);

    can.close();
  });
});
