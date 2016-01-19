#! /usr/bin/env node
const uuid = require('uuid');
const enchannel = require('enchannel-zmq-backend');

const marked = require('marked');
const TerminalRenderer = require('marked-terminal');

marked.setOptions({
  renderer: new TerminalRenderer(),
});

const temp = require('temp').track();
const imageToAscii = require('image-to-ascii');

const fs = require('fs');

const identity = uuid.v4();
const runtime = process.argv[2];
const config = require(runtime);
const iopub = enchannel.createIOPubSubject(identity, config);
const displayData = iopub
                      .filter(msg => msg.header.msg_type === 'execute_result' ||
                              msg.header.msg_type === 'display_data')
                      .filter(msg => msg.content)
                      .map(msg => msg.content.data);

const streamReply = iopub
                      .filter(msg => msg.header.msg_type === 'stream')
                      .map(msg => msg.content);

streamReply.subscribe(content => {
  switch(content.name) {
  case 'stdout':
    process.stdout.write(content.text);
    break;
  case 'stderr':
    process.stderr.write(content.text);
    break;
  }
});

displayData.subscribe(data => {
  if(data['image/png']) {
    if(process.env.TERM_PROGRAM === 'iTerm.app') {
      const outputStream = process.stdout;
      outputStream.write('\u001b]1337;');
      outputStream.write('File=inline=1:');
      outputStream.write(data['image/png']);
      outputStream.write('\u0007\n');
      return;
    }

    temp.open('ick-image', (err, info) => {
      if (err) {
        console.error(err);
        return;
      }
      const decodedData = new Buffer(data['image/png'], 'base64');
      const writer = fs.createWriteStream(info.path);
      writer.end(decodedData);
      writer.on('finish', () => {
        imageToAscii(info.path, (imErr, converted) => {
          console.log(imErr || converted);
        });
      });
    });
  }
  else if(data['text/markdown']) {
    console.log(marked(data['text/markdown']));
  }
  else if(data['text/plain']) {
    console.log(data['text/plain']);
  }
});
