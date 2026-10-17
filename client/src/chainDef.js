// Terra Classic (columbus-5) chain definition for Cosmos Kit.
// Hand-rolled (minimal but complete) so Keplr/Station can suggest the
// chain and sign against the PublicNode endpoints.
export const CHAIN_NAME = 'terraclassic';

export const terraClassicChain = {
  $schema: 'https://raw.githubusercontent.com/cosmos/chain-registry/master/chain.schema.json',
  chain_name: CHAIN_NAME,
  status: 'live',
  network_type: 'mainnet',
  website: 'https://terra-classic.io/',
  pretty_name: 'Terra Classic',
  chain_type: 'cosmos',
  chain_id: 'columbus-5',
  bech32_prefix: 'terra',
  daemon_name: 'terrad',
  node_home: '$HOME/.terra',
  key_algos: ['secp256k1'],
  slip44: 330,
  fees: {
    fee_tokens: [
      {
        denom: 'uluna',
        fixed_min_gas_price: 28.325,
        low_gas_price: 28.325,
        average_gas_price: 28.325,
        high_gas_price: 28.325,
      },
    ],
  },
  staking: {
    staking_tokens: [{ denom: 'uluna' }],
    lock_duration: { time: '1814400s' },
  },
  codebase: {
    git_repo: 'https://github.com/classic-terra/core',
    recommended_version: 'v4.1.1',
    compatible_versions: ['v4.1.1'],
    binaries: {},
    language: { type: 'go', version: '1.21' },
    genesis: { genesis_url: 'https://raw.githubusercontent.com/classic-terra/genesis/main/columbus-5/genesis.json' },
  },
  apis: {
    rpc: [{ address: 'https://terra-classic-rpc.publicnode.com', provider: 'PublicNode' }],
    rest: [{ address: 'https://terra-classic-lcd.publicnode.com', provider: 'PublicNode' }],
    grpc: [],
  },
  explorers: [
    { kind: 'finder', url: 'https://finder.terra-classic.io/columbus-5/tx/${txHash}' },
  ],
};

export const terraClassicAssets = {
  $schema: 'https://raw.githubusercontent.com/cosmos/chain-registry/master/assetlist.schema.json',
  chain_name: CHAIN_NAME,
  assets: [
    {
      description: 'The native token of Terra Classic',
      denom_units: [
        { denom: 'uluna', exponent: 0 },
        { denom: 'luna', exponent: 6, aliases: [] },
      ],
      base: 'uluna',
      name: 'Luna Classic',
      display: 'luna',
      symbol: 'LUNC',
      coingecko_id: 'terra-luna',
    },
  ],
};
