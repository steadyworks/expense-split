'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const API = 'http://localhost:3001'

export default function Home() {
  const router = useRouter()
  const [groupName, setGroupName] = useState('')
  const [memberInput, setMemberInput] = useState('')
  const [members, setMembers] = useState([])

  const addMember = () => {
    const name = memberInput.trim()
    if (!name || members.includes(name)) return
    setMembers([...members, name])
    setMemberInput('')
  }

  const removeMember = (name) => {
    setMembers(members.filter((m) => m !== name))
  }

  const createGroup = async () => {
    const res = await fetch(`${API}/api/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: groupName.trim(), members }),
    })
    const data = await res.json()
    router.push(`/g/${data.id}`)
  }

  const canCreate = groupName.trim().length > 0 && members.length >= 2

  return (
    <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Group Expense Splitter</h1>

      <div style={{ marginBottom: '1rem' }}>
        <label>
          <div>Group Name</div>
          <input
            data-testid="group-name-input"
            placeholder="e.g. Trip to Vegas"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            style={{ padding: '0.5rem', width: '100%', boxSizing: 'border-box' }}
          />
        </label>
      </div>

      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
        <input
          data-testid="member-name-input"
          placeholder="Member name"
          value={memberInput}
          onChange={(e) => setMemberInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addMember()}
          style={{ padding: '0.5rem', flex: 1 }}
        />
        <button
          data-testid="add-member-btn"
          onClick={addMember}
          style={{ padding: '0.5rem 1rem' }}
        >
          Add Member
        </button>
      </div>

      <div style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {members.map((m) => (
          <span
            key={m}
            data-testid="member-tag"
            style={{
              background: '#e0e0e0',
              borderRadius: '16px',
              padding: '0.25rem 0.75rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {m}
            <button
              data-testid="remove-member-btn"
              onClick={() => removeMember(m)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0',
                fontWeight: 'bold',
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <button
        data-testid="create-group-btn"
        onClick={createGroup}
        disabled={!canCreate}
        style={{
          padding: '0.75rem 1.5rem',
          background: canCreate ? '#4CAF50' : '#ccc',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: canCreate ? 'pointer' : 'not-allowed',
        }}
      >
        Create Group
      </button>
    </main>
  )
}
