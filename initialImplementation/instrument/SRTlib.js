/**
 * This File is based on the SRTlib implementation of NodeSRT
 * GitHub Repository: https://github.com/charlie-cyf/nodeSRT
 */

const axios = require('axios');

module.exports = class SRTlib {
  static endPointUrl = 'http://localhost:8888/instrument-message';
  static message = '';

  static startLogger() {
    if (SRTlib.started) return;
    SRTlib.started = true;
    SRTlib.message = '';
  }

  static send(msg) {
    if (SRTlib.message > 999999) {
      this.endLogger();
      this.startLogger();
    }
    if (!SRTlib.message.includes(msg)) SRTlib.message = SRTlib.message + msg;
  }

  static async endLogger() {
    if (SRTlib.message.length !== 0) {
      const msg = SRTlib.message;
      SRTlib.message = '';
      await axios
        .post(SRTlib.endPointUrl, {
          msg: msg
        })
        .then((res) => {
          if (res.status < 400) {
            // SRTlib.message = ''
          } else {
            new Error('fail to send to log server!');
          }
        })
        .catch((err) => {
          new Error('fail to send to log server!', err);
        });
    }
  }
};
