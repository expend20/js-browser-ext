const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

async function callGemini(apiKey, model, prompt, content, contentType = 'text') {
  const url = `${GEMINI_API_BASE_URL}${model}:generateContent?key=${apiKey}`;

  let parts;
  if (contentType === 'image') {
    // Image content is expected to be an object with data and mimeType
    parts = [
      { text: prompt },
      {
        inline_data: {
          mime_type: content.mimeType,
          data: content.data,
        },
      },
    ];
  } else {
    // For text based content (HTML, Markdown)
    parts = [{ text: `${prompt}\n\n${content}` }];
  }

  const body = {
    contents: [{ parts }],
  };

  try {
    console.log(`Sending data to Gemini - Model: ${model}, Content-Type: ${contentType}, Content size: ${contentType === 'image' ? content.data.length : content.length} bytes.`);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.json();
      console.error('Gemini API request failed:', errorBody);
      // Extract user-friendly error message
      let userError = 'Gemini API error';
      const status = response.status;
      const apiMsg = errorBody?.error?.message || '';

      if (status === 429 || apiMsg.includes('quota')) {
        userError = 'Gemini quota exceeded - check billing';
      } else if (status === 401 || status === 403 || apiMsg.includes('API key')) {
        userError = 'Invalid Gemini API key';
      } else if (status === 400) {
        userError = 'Invalid request to Gemini';
      } else if (apiMsg) {
        // Truncate long messages
        userError = apiMsg.length > 60 ? apiMsg.substring(0, 60) + '...' : apiMsg;
      }
      throw new Error(userError);
    }

    const data = await response.json();

    const result = {
      text: '',
      promptTokens: 0,
      candidateTokens: 0,
      totalTokens: 0,
    };

    if (data.candidates && data.candidates.length > 0) {
      const firstCandidate = data.candidates[0];
      if (firstCandidate.content && firstCandidate.content.parts && firstCandidate.content.parts.length > 0) {
        result.text = firstCandidate.content.parts[0].text;
      }
    }

    if (data.usageMetadata) {
      result.promptTokens = data.usageMetadata.promptTokenCount || 0;
      result.candidateTokens = data.usageMetadata.candidatesTokenCount || 0;
      result.totalTokens = data.usageMetadata.totalTokenCount || 0;
    }
    
    // Fallback if the structure is unexpected
    if (!result.text) {
      result.text = JSON.stringify(data, null, 2);
    }
    
    return result;

  } catch (error) {
    console.error('Error calling Gemini API:', error);
    throw error;
  }
}
