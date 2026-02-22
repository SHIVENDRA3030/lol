const key = "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";

async function test() {
    try {
        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
                model: 'meta/llama-3.1-70b-instruct',
                messages: [{ role: 'user', content: 'hello' }],
                temperature: 0.7,
                max_tokens: 1024,
            })
        });

        console.log('Status:', response.status);
        const text = await response.text();
        console.log('Body:', text);
    } catch (err) {
        console.error('Fetch error:', err);
    }
}

test();
