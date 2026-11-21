/**
 * Request signing for CapCut's (unofficial) text-to-speech API. Ported from the Python SDK
 * `capcut-tts-api` 1.5.0 used by D:\code\short-cartoon-horror; keep the formulas byte-for-byte.
 */
import crypto from 'crypto';

export type CapCutDevice = {
  aid: string;
  appName: string;
  appVersion: string;
  channel: string;
  platform: string;
  deviceType: string;
  osVersion: string;
  deviceId: string;
  region: string;
  language: string;
};

const TTS_SIGN_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmTd34Lw4b7IuldSXh/zY
CMla+ITdGG5TeWz6ad+OySd4r+IrY45AoqrYUxhQ2dl+7z+i7r/5vEa8rr39BYfB
8AGMQLmZA8HmgpWBsqrn/V6daUALkKnkLb70Fn32CJigIuGXAYqxUdGuI340aC+0
v5Es3puJsHyzf01/AelE4Cdc6bZhQrASJLBh8R3BQToYClmDVSDUQk28o8sl/guA
Z4n303Vj+6Siv1HayPCdV6kpVVnMBAG4+umUbwGmn132N3fgpzLarFF3XyWmS1zh
D/J07iM/rP8GDO9IskHNHd2phrO0G6KzrcFAnTBHjVv+hCBEfzN/no3FNA9AuC36
mwIDAQAB
-----END PUBLIC KEY-----`;

const md5 = (text: string) => crypto.createHash('md5').update(text, 'utf8').digest('hex');

export function createDevice(region = 'VN', language = 'vi-VN'): CapCutDevice {
  // A random 20-digit id, like the SDK: one per server run
  const deviceId = String(1 + Math.floor(Math.random() * 9)) + Array.from({ length: 19 }, () => Math.floor(Math.random() * 10)).join('');
  return {
    aid: '359289',
    appName: 'CapCut',
    appVersion: '8.7.0',
    channel: 'capcutpc_google',
    platform: 'mac',
    deviceType: 'MacBookPro17,4',
    osVersion: '15.7.4',
    deviceId,
    region,
    language,
  };
}

export const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function commonQuery(device: CapCutDevice, babiParam?: unknown, includeRegion = true): Record<string, string> {
  const q: Record<string, string> = {
    app_name: device.appName,
    device_type: device.deviceType,
    os_version: device.osVersion,
    channel: device.channel,
    version_name: device.appVersion,
    device_brand: device.deviceType,
    device_id: device.deviceId,
    iid: device.deviceId,
    version_code: device.appVersion,
    device_platform: device.platform,
    aid: device.aid,
  };
  if (includeRegion) q.region = device.region;
  if (babiParam !== undefined) q.babi_param = JSON.stringify(babiParam);
  return q;
}

export function baseHeaders(device: CapCutDevice, body: string, withAppId: boolean): Record<string, string> {
  const now = String(Math.floor(Date.now() / 1000));
  const seed = crypto.randomUUID().replace(/-/g, '');
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    appvr: device.appVersion,
    ch: device.channel,
    'device-time': now,
    lan: device.language,
    loc: device.region,
    pf: '3',
    'sign-ver': '1',
    tdid: device.deviceId,
    'x-ss-stub': md5(body),
    'x-ss-dp': device.aid,
    'x-khronos': now,
    'x-tt-trace-id': `00-${seed}-${seed.slice(0, 16)}-01`,
    'user-agent': 'Cronet/TTNetVersion:1d7cc3b1 2025-07-16 QuicVersion:52c2b40d 2025-04-03',
    'accept-encoding': 'gzip, deflate',
    'store-country-code': device.region.toLowerCase(),
    'store-country-code-src': 'did',
    'is-dispatch-us-ttp': '0',
    'is-app-region-us-ttp': '0',
  };
  if (withAppId) {
    headers['app-sdk-version'] = device.appVersion;
    headers.appid = device.aid;
  }
  return headers;
}

export function signHeader(url: string, device: CapCutDevice, deviceTime: string): string {
  const path = url.split('?', 1)[0];
  return md5(`9e2c|${path.slice(-7)}|3|${device.appVersion}|${deviceTime}|${device.deviceId}|11ac`);
}

export function ttsPayloadSign(ssml: string, extraInfo: string, device: CapCutDevice): string {
  const input = `appid:${device.aid}&did:${device.deviceId}&creditDisable:false&ssml:${md5(ssml)}&extraInfo:${extraInfo}`;
  return crypto
    .publicEncrypt({ key: TTS_SIGN_PUBLIC_KEY_PEM, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(input, 'utf8'))
    .toString('base64');
}
