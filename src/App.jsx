import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ethers } from 'ethers';

const TARGET_CHAIN_ID = 369;
const TARGET_CHAIN_HEX = '0x171';

const CONTRACT_ADDRESS = '0x8577f0FB9D709d5BeBd808dDDd0094FbAEc667B4';

const ABI = [
  {
    "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
    "name": "totalCashXAcquired",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
    "name": "totalBurnXAcquired",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalCashXBurnt",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
];

const config = window.__QUICK_DAPP_CONFIG__ || {};
const APP_TITLE = config.title || 'BurnX Dashboard';

function shortenAddress(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
}

function formatToken(raw, decimals = 18, dp = 4) {
  try {
    const val = ethers.formatUnits(raw, decimals);
    const num = parseFloat(val);
    if (num === 0) return '0';
    if (num < 0.0001) return '< 0.0001';
    return num.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  } catch {
    return '—';
  }
}

// ── Stat Card ──────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent, loading }) {
  return (
    <div className={`stat-card ${accent}`}>
      <p className="stat-label">{label}</p>
      {loading ? (
        <div className="skeleton-bar" />
      ) : (
        <p className="stat-value">{value}</p>
      )}
      {sub && !loading && <p className="stat-sub">{sub}</p>}
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const rawProviderRef = useRef(null);

  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [switchingChain, setSwitchingChain] = useState(false);
  const [error, setError] = useState('');

  // Stats
  const [burnXBalance, setBurnXBalance] = useState(null);
  const [cashXAcquired, setCashXAcquired] = useState(null);
  const [burnXAcquired, setBurnXAcquired] = useState(null);
  const [cashXBurnt, setCashXBurnt] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [decimals, setDecimals] = useState(18);

  const isCorrectChain = chainId === TARGET_CHAIN_ID;

  // ── Get provider ────────────────────────────────────────────────────────
  async function getRawProvider() {
    if (window.__qdapp_getProvider) return await window.__qdapp_getProvider();
    return window.ethereum;
  }

  // ── Fetch stats ─────────────────────────────────────────────────────────
  const fetchStats = useCallback(async (addr) => {
    if (!addr) return;
    setStatsLoading(true);
    setError('');
    try {
      const raw = rawProviderRef.current;
      if (!raw) throw new Error('No provider');
      const provider = new ethers.BrowserProvider(raw);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

      const [dec, bal, cashX, burnX, burnt] = await Promise.all([
        contract.decimals(),
        contract.balanceOf(addr),
        contract.totalCashXAcquired(addr),
        contract.totalBurnXAcquired(addr),
        contract.totalCashXBurnt()
      ]);

      setDecimals(Number(dec));
      setBurnXBalance(bal);
      setCashXAcquired(cashX);
      setBurnXAcquired(burnX);
      setCashXBurnt(burnt);
    } catch (e) {
      console.error(e);
      setError('Failed to load stats. Make sure you are on PulseChain.');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // ── Connect wallet ───────────────────────────────────────────────────────
  async function connect() {
    setConnecting(true);
    setError('');
    try {
      const raw = await getRawProvider();
      if (!raw) throw new Error('No wallet detected. Please install MetaMask or a PulseChain-compatible wallet.');
      rawProviderRef.current = raw;

      const provider = new ethers.BrowserProvider(raw);
      const accounts = await provider.send('eth_requestAccounts', []);
      if (!accounts.length) throw new Error('No accounts returned.');

      const network = await provider.getNetwork();
      const cid = Number(network.chainId);
      setChainId(cid);
      setAccount(accounts[0]);

      if (cid === TARGET_CHAIN_ID) {
        await fetchStats(accounts[0]);
      }
    } catch (e) {
      setError(e.message || 'Connection failed.');
    } finally {
      setConnecting(false);
    }
  }

  // ── Switch network ───────────────────────────────────────────────────────
  async function switchNetwork() {
    setSwitchingChain(true);
    setError('');
    try {
      const raw = rawProviderRef.current;
      if (!raw) throw new Error('No provider.');
      await raw.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: TARGET_CHAIN_HEX }]
      });
    } catch (e) {
      if (e.code === 4902) {
        try {
          await rawProviderRef.current.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: TARGET_CHAIN_HEX,
              chainName: 'PulseChain',
              nativeCurrency: { name: 'PLS', symbol: 'PLS', decimals: 18 },
              rpcUrls: ['https://rpc.pulsechain.com'],
              blockExplorerUrls: ['https://scan.pulsechain.com']
            }]
          });
        } catch (addErr) {
          setError('Could not add PulseChain to your wallet.');
        }
      } else {
        setError(e.message || 'Failed to switch network.');
      }
    } finally {
      setSwitchingChain(false);
    }
  }

  // ── Disconnect ───────────────────────────────────────────────────────────
  function disconnect() {
    setAccount(null);
    setChainId(null);
    setBurnXBalance(null);
    setCashXAcquired(null);
    setBurnXAcquired(null);
    setCashXBurnt(null);
    setError('');
    rawProviderRef.current = null;
  }

  // ── Listen for account / chain changes ───────────────────────────────────
  useEffect(() => {
    async function setup() {
      const raw = await getRawProvider();
      if (!raw) return;
      rawProviderRef.current = raw;

      raw.on('accountsChanged', async (accounts) => {
        if (!accounts.length) { disconnect(); return; }
        setAccount(accounts[0]);
        if (chainId === TARGET_CHAIN_ID) await fetchStats(accounts[0]);
      });

      raw.on('chainChanged', async (hexChain) => {
        const cid = parseInt(hexChain, 16);
        setChainId(cid);
        if (cid === TARGET_CHAIN_ID && account) {
          await fetchStats(account);
        } else {
          setBurnXBalance(null);
          setCashXAcquired(null);
          setBurnXAcquired(null);
          setCashXBurnt(null);
        }
      });
    }
    setup();
  }, [account, chainId, fetchStats]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app-root">
      {/* Header */}
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-icon">🔥</span>
            <span className="brand-title">{APP_TITLE}</span>
          </div>
          <div className="wallet-area">
            {!account ? (
              <button className="btn btn-connect" onClick={connect} disabled={connecting}>
                {connecting ? 'Connecting…' : 'Connect Wallet'}
              </button>
            ) : (
              <div className="wallet-info">
                <span className={`chain-badge ${isCorrectChain ? 'chain-ok' : 'chain-bad'}`}>
                  {isCorrectChain ? 'PulseChain' : `Chain ${chainId}`}
                </span>
                <span className="address-badge">{shortenAddress(account)}</span>
                <button className="btn btn-disconnect" onClick={disconnect}>Disconnect</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="app-main">
        {/* Error banner */}
        {error && (
          <div className="error-banner">
            <span>⚠️ {error}</span>
            <button onClick={() => setError('')} className="error-close">✕</button>
          </div>
        )}

        {/* Wrong network */}
        {account && !isCorrectChain && (
          <div className="wrong-chain-box">
            <p className="wrong-chain-title">Wrong Network</p>
            <p className="wrong-chain-sub">Please switch to PulseChain to view your BurnX stats.</p>
            <button className="btn btn-switch" onClick={switchNetwork} disabled={switchingChain}>
              {switchingChain ? 'Switching…' : 'Switch to PulseChain'}
            </button>
          </div>
        )}

        {/* Not connected */}
        {!account && (
          <div className="hero-section">
            <div className="hero-glow" />
            <div className="hero-content">
              <div className="hero-icon">🔥</div>
              <h1 className="hero-title">BurnX Reward Tracker</h1>
              <p className="hero-desc">
                Connect your wallet to view your personal BurnX reward stats and the global CashX burn total on PulseChain.
              </p>
              <button className="btn btn-connect btn-lg" onClick={connect} disabled={connecting}>
                {connecting ? 'Connecting…' : 'Connect Wallet'}
              </button>
            </div>
          </div>
        )}

        {/* Stats */}
        {account && isCorrectChain && (
          <div className="stats-section">
            <div className="section-header">
              <h2 className="section-title">Your BurnX Stats</h2>
              <p className="section-sub">{shortenAddress(account)}</p>
              <button
                className="btn btn-refresh"
                onClick={() => fetchStats(account)}
                disabled={statsLoading}
              >
                {statsLoading ? '⟳ Loading…' : '⟳ Refresh'}
              </button>
            </div>

            <div className="cards-grid">
              <StatCard
                label="BurnX Balance"
                value={burnXBalance !== null ? formatToken(burnXBalance, decimals) + ' BURNX' : '—'}
                sub="Your current BurnX holdings"
                accent="accent-orange"
                loading={statsLoading}
              />
              <StatCard
                label="CashX Acquired from Holding"
                value={cashXAcquired !== null ? formatToken(cashXAcquired, decimals) + ' CASHX' : '—'}
                sub="Total CashX earned by holding BurnX"
                accent="accent-green"
                loading={statsLoading}
              />
              <StatCard
                label="BurnX Acquired from Holding"
                value={burnXAcquired !== null ? formatToken(burnXAcquired, decimals) + ' BURNX' : '—'}
                sub="Total BurnX earned by holding BurnX"
                accent="accent-red"
                loading={statsLoading}
              />
            </div>

            <div className="divider" />

            <div className="section-header">
              <h2 className="section-title">Global Stats</h2>
              <p className="section-sub">Contract-wide metrics</p>
            </div>

            <div className="cards-grid cards-grid-single">
              <StatCard
                label="Total CashX Burnt"
                value={cashXBurnt !== null ? formatToken(cashXBurnt, decimals) + ' CASHX' : '—'}
                sub="Total CashX burnt from the contract"
                accent="accent-purple"
                loading={statsLoading}
              />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>BurnX · PulseChain · <span className="footer-addr">{CONTRACT_ADDRESS}</span></p>
      </footer>
    </div>
  );
}
