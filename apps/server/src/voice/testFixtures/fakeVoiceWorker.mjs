// Stands in for voice-worker: answers with what it was given, or misbehaves when told to.
import * as NodeFS from "node:fs";
import * as NodeStreamConsumers from "node:stream/consumers";

const [model, detector] = process.argv.slice(2);
const { audio, prompt, sampleRate } = await NodeStreamConsumers.json(process.stdin);
const said = Buffer.from(audio, "base64").toString();
const command = said.split(" ");
if (command[0] === "crash") process.abort();
if (command[0] === "hang") {
  NodeFS.writeFileSync(command[1], String(process.pid));
  setInterval(() => {}, 1000);
} else {
  const files = [model, detector].map((path) => NodeFS.readFileSync(path, "utf8"));
  process.stdout.write(JSON.stringify({ text: [said, prompt, sampleRate, ...files].join(" | ") }));
}
