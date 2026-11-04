/**
 * Mock serialport binding that emulates a CAN-USB-COM device
 *
 * Implements the serialport v10+ binding interface
 * (see @serialport/bindings-interface):
 *
 *   binding.list() -> Promise<PortInfo[]>
 *   binding.open(options) -> Promise<BindingPort>
 *
 * Pass it to the CanUsbCom constructor as the `Binding` option.  Any
 * `bindingOptions` given to CanUsbCom are passed through to open(); the mock
 * recognizes `bindingOptions.packetcb(port, packet)`, which is called for each
 * CAN frame the module sends.
 */

const MOCK_PORT = '/dev/MOCK';

function resolveNextTick() {
  return new Promise(resolve => process.nextTick(() => resolve()));
}

// Error used to cancel a pending read when the port closes.  The serialport
// stream ignores read errors that have `canceled` set.
function canceledError(message) {
  const err = new Error(message);
  err.canceled = true;
  return err;
}

/**
 * An open (mock) port
 */
class MockPort {
  constructor(openOptions) {
    this.openOptions = openOptions;
    this.isOpen = true;
    this.maxReadSize = 1000;
    this.rxdata = Buffer.alloc(0);
    this.pendingRead = null;
    this.configMode = true;
    this.txPackets = [];
    this.path = openOptions.path;

    const bindingOptions = openOptions.bindingOptions || {};
    this.packetcb = bindingOptions.packetcb;
  }

  async close() {
    if(!this.isOpen) {
      throw new Error('Port is not open');
    }
    this.isOpen = false;

    if(this.pendingRead) {
      const pendingRead = this.pendingRead;
      this.pendingRead = null;
      pendingRead(canceledError('Port is closed'));
    }
    await resolveNextTick();
  }

  async read(buffer, offset, length) {
    if(!Buffer.isBuffer(buffer)) {
      throw new TypeError('"buffer" is not a Buffer');
    }
    if(typeof offset !== 'number' || isNaN(offset)) {
      throw new TypeError(`"offset" is not an integer got "${isNaN(offset) ? 'NaN' : typeof offset}"`);
    }
    if(typeof length !== 'number' || isNaN(length)) {
      throw new TypeError(`"length" is not an integer got "${isNaN(length) ? 'NaN' : typeof length}"`);
    }
    if(buffer.length < offset + length) {
      throw new Error('buffer is too small');
    }
    if(!this.isOpen) {
      throw new Error('Port is not open');
    }

    await resolveNextTick();
    if(!this.isOpen) {
      throw canceledError('Read canceled');
    }
    if(this.disconnectError) {
      const err = this.disconnectError;
      this.disconnectError = null;
      throw err;
    }
    if(this.rxdata.length <= 0) {
      return new Promise((resolve, reject) => {
        this.pendingRead = err => {
          if(err) {
            return reject(err);
          }
          this.read(buffer, offset, length).then(resolve, reject);
        };
      });
    }
    const lengthToRead = this.maxReadSize > length ? length : this.maxReadSize;
    const data = this.rxdata.subarray(0, lengthToRead);
    const bytesRead = data.copy(buffer, offset);
    this.rxdata = this.rxdata.subarray(bytesRead);

    return { bytesRead, buffer };
  }

  // Pretend the adapter was unplugged. The pending read fails, which the
  // serialport stream treats as a disconnection: it closes the port and emits
  // 'close' with an error that has `disconnected` set.
  disconnect() {
    const err = new Error('Device disconnected');
    if(this.pendingRead) {
      const pendingRead = this.pendingRead;
      this.pendingRead = null;
      pendingRead(err);
    } else {
      // No read is waiting yet; fail the next one
      this.disconnectError = err;
    }
  }

  // Emit data on a mock port
  emitData(data) {
    if(!this.isOpen) {
      throw new Error('Port must be open to pretend to receive data');
    }
    const bufferData = Buffer.isBuffer(data) ? data : Buffer.from(data);

    this.rxdata = Buffer.concat([this.rxdata, bufferData]);
    if(this.pendingRead) {
      process.nextTick(this.pendingRead);
      this.pendingRead = null;
    }
  }

  async write(buffer) {
    if(!this.isOpen) {
      throw new Error('Port is not open');
    }

    let cmd = buffer.toString().trim();

    switch (cmd.toUpperCase()) {
      case ':CONFIG;':
        this.configMode = true;
        this.emitData('#0#');
        break;

      case 'SET CAN PORT 250000 75':
        this.emitData('<A:>');
        break;

      case 'DEL CAN FILTER ALL':
        this.emitData('<A:All filters deleted>');
        break;

      case 'EXIT':
        this.configMode = false;
        this.emitData('<A>');
        break;

      default:
        if(cmd.startsWith('SET CAN FILTER')) {
          this.emitData('<A:>');
        } else if(cmd.startsWith('SET CAN CM FILTER')) {
          this.emitData('<A:EOL=NONE>');
        } else if(cmd.startsWith(':')) {
          // send packet
          this._txPacket(cmd.matchAll(/:([SX])([A-F0-9]{3,8})([NFH])((?:[A-F0-9])*);/g));
        } else if(cmd.startsWith('|')) {
          this._txPacket(cmd.matchAll(/\|([SX])([A-F0-9]{3,8})([NFH])((?:[A-F0-9])*);/g), true);
        } else {
          throw new Error('MockBinding::unhandled command');
        }

        break;
    }

  }

  async update() {
    throw new Error('MockBinding::update not implemented');
  }

  async set() {
    throw new Error('MockBinding::set not implemented');
  }

  async get() {
    throw new Error('MockBinding::get not implemented');
  }

  async getBaudRate() {
    throw new Error('MockBinding::getBaudRate not implemented');
  }

  async flush() {
    throw new Error('MockBinding::flush not implemented');
  }

  async drain() {
    if(!this.isOpen) {
      throw new Error('Port is not open');
    }
  }

  _txPacket(p, loopback) {

    for(const packet of p) {
      this.txPackets.push(packet);
      if(typeof this.packetcb === 'function') {
        this.packetcb(this, packet);
      }
      if(loopback) {
        let str = packet[0];

        this.emitData(':' + str.slice(1));
      }
    }
  }
}

/**
 * The binding itself
 */
module.exports = {

  async list() {
    return [{
      path: MOCK_PORT,
      manufacturer: 'Mockery Inc',
      serialNumber: undefined,
      pnpId: undefined,
      locationId: undefined,
      vendorId: '0403',
      productId: '6001',
    }];
  },

  async open(options) {
    if(!options || typeof options.path !== 'string') {
      throw new TypeError('"path" is not a valid port');
    }
    await resolveNextTick();
    return new MockPort(options);
  },
};
