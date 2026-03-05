'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'

const API = 'http://localhost:3001'

export default function GroupPage() {
  const params = useParams()
  const groupId = params.groupId

  const [group, setGroup] = useState(null)
  const [currentUrl, setCurrentUrl] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [payer, setPayer] = useState('')
  const [splitAmong, setSplitAmong] = useState([])

  useEffect(() => {
    setCurrentUrl(window.location.href)
  }, [])

  const loadGroup = useCallback(async () => {
    const res = await fetch(`${API}/api/groups/${groupId}`)
    if (!res.ok) return
    const data = await res.json()
    setGroup(data)
  }, [groupId])

  useEffect(() => {
    loadGroup()
  }, [loadGroup])

  const openForm = () => {
    if (!group) return
    setDescription('')
    setAmount('')
    setPayer(group.members[0]?.name || '')
    setSplitAmong(group.members.map((m) => m.name))
    setShowForm(true)
  }

  const cancelForm = () => {
    setShowForm(false)
  }

  const submitExpense = async () => {
    if (!description.trim() || !amount || splitAmong.length === 0) return
    await fetch(`${API}/api/groups/${groupId}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: description.trim(),
        amount: parseFloat(amount),
        payer_name: payer,
        split_among: splitAmong,
      }),
    })
    setShowForm(false)
    setDescription('')
    setAmount('')
    await loadGroup()
  }

  const settle = async (debt) => {
    await fetch(`${API}/api/groups/${groupId}/settlements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payer_name: debt.debtor_name,
        payee_name: debt.creditor_name,
        amount: debt.amount,
      }),
    })
    await loadGroup()
  }

  const toggleMember = (name, checked) => {
    if (checked) {
      setSplitAmong((prev) => [...prev, name])
    } else {
      setSplitAmong((prev) => prev.filter((n) => n !== name))
    }
  }

  if (!group) {
    return <div style={{ padding: '2rem' }}>Loading...</div>
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1 data-testid="group-title">{group.name}</h1>

      <div style={{ marginBottom: '1rem' }}>
        <div data-testid="shareable-link" style={{ fontFamily: 'monospace', background: '#f5f5f5', padding: '0.5rem', borderRadius: '4px' }}>
          {currentUrl}
        </div>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <button
          data-testid="add-expense-btn"
          onClick={openForm}
          style={{ padding: '0.5rem 1rem', background: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Add Expense
        </button>
      </div>

      {showForm && (
        <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
          <h3>New Expense</h3>
          <div style={{ marginBottom: '0.75rem' }}>
            <label>
              <div>Description</div>
              <input
                data-testid="expense-description-input"
                placeholder="What was this for?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ padding: '0.5rem', width: '100%', boxSizing: 'border-box' }}
              />
            </label>
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label>
              <div>Amount ($)</div>
              <input
                data-testid="expense-amount-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ padding: '0.5rem', width: '100%', boxSizing: 'border-box' }}
              />
            </label>
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label>
              <div>Paid by</div>
              <select
                data-testid="expense-payer-select"
                value={payer}
                onChange={(e) => setPayer(e.target.value)}
                style={{ padding: '0.5rem', width: '100%' }}
              >
                {group.members.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <div>Split among</div>
            {group.members.map((m) => (
              <label key={m.id} style={{ display: 'block', marginBottom: '0.25rem' }}>
                <input
                  type="checkbox"
                  data-testid="expense-member-checkbox"
                  checked={splitAmong.includes(m.name)}
                  onChange={(e) => toggleMember(m.name, e.target.checked)}
                />
                {' '}{m.name}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              data-testid="expense-submit"
              onClick={submitExpense}
              style={{ padding: '0.5rem 1rem', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Submit
            </button>
            <button
              data-testid="expense-cancel"
              onClick={cancelForm}
              style={{ padding: '0.5rem 1rem', background: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div data-testid="balance-sheet" style={{ marginBottom: '1.5rem' }}>
        <h2>Balance Sheet</h2>
        {group.debts.length === 0 ? (
          <div data-testid="balance-empty" style={{ color: '#666', fontStyle: 'italic' }}>
            All settled up! No outstanding debts.
          </div>
        ) : (
          group.debts.map((debt, i) => (
            <div
              key={i}
              data-testid="debt-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                marginBottom: '0.5rem',
              }}
            >
              <span data-testid="debt-description">
                {debt.debtor_name} owes {debt.creditor_name} ${debt.amount.toFixed(2)}
              </span>
              <button
                data-testid="settle-btn"
                onClick={() => settle(debt)}
                style={{ padding: '0.25rem 0.75rem', background: '#FF9800', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Settle
              </button>
            </div>
          ))
        )}
      </div>

      <div data-testid="activity-feed">
        <h2>Activity</h2>
        {group.activity.length === 0 ? (
          <div style={{ color: '#666', fontStyle: 'italic' }}>No activity yet.</div>
        ) : (
          group.activity.map((item) => (
            <div
              key={item.id}
              data-testid="activity-item"
              style={{
                padding: '0.75rem',
                border: '1px solid #eee',
                borderRadius: '4px',
                marginBottom: '0.5rem',
                background: item.type === 'settlement' ? '#f0f8ff' : '#fff',
              }}
            >
              {item.type === 'expense' ? (
                <span>
                  <strong>{item.description}</strong> — {item.payer_name} paid ${item.amount.toFixed(2)}
                  {item.split_among && item.split_among.length > 0 && (
                    <span> (split among {item.split_among.join(', ')})</span>
                  )}
                </span>
              ) : (
                <span>
                  {item.payer_name} paid {item.payee_name} ${item.amount.toFixed(2)} (settlement)
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </main>
  )
}
