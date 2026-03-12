# AI Call Comparison: AI-Sidebar vs expressecm-genai

## Key Difference: Orchestration vs Direct Model API

### AI-Sidebar-Extension ✅ (CORRECT - Uses Orchestration)

**Endpoint:**
```
https://api.ai.prod.us-east-1.aws.ml.hana.ondemand.com/v2/inference/deployments/da1068f8a530837a/v2/completion
```

**Request Body:**
```json
{
  "config": {
    "modules": {
      "prompt_templating": {
        "model": {
          "name": "anthropic--claude-4.6-sonnet",
          "params": {
            "max_tokens": 1024,
            "temperature": 0.7
          }
        },
        "prompt": {
          "template": [
            { "role": "system", "content": "..." },
            { "role": "user", "content": "Hi" }
          ]
        }
      }
    }
  }
}
```

**Key Features:**
- ✅ Uses **Orchestration Deployment** (`/v2/completion`)
- ✅ Model name: `anthropic--claude-4.6-sonnet`
- ✅ Wraps messages in `config.modules.prompt_templating`
- ✅ Supports multiple models (GPT-5, Claude, etc.)
- ✅ Dynamic model selection from foundation-models catalog

---

### expressecm-genai ❌ (INCORRECT - Uses Old Chat Completions API)

**Endpoint:**
```
/dynamic_dest/genai-dest/inference/deployments/d0e8c5c3e4b01dd5/chat/completions?api-version=2024-02-01
```

**Request Body:**
```json
{
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "max_tokens": 4000,
  "temperature": 0.7
}
```

**Issues:**
- ❌ Uses `/chat/completions` endpoint (old OpenAI-style API)
- ❌ Hardcoded deployment ID: `d0e8c5c3e4b01dd5`
- ❌ Does NOT specify which model to use
- ❌ Missing `config.modules.prompt_templating` wrapper
- ❌ Will fail because AI Core expects orchestration format

---

## The Problem

The expressecm-genai controller is using the **wrong API format**. It's sending OpenAI-style chat completions format instead of SAP AI Core Orchestration format.

### What's Wrong:

1. **Wrong Endpoint Pattern:**
   - ❌ `/inference/deployments/{id}/chat/completions`
   - ✅ Should be: `/inference/deployments/{id}/v2/completion`

2. **Wrong Request Format:**
   - ❌ Sends raw `messages` array
   - ✅ Should wrap in `config.modules.prompt_templating.prompt.template`

3. **Missing Model Specification:**
   - ❌ No model name specified
   - ✅ Should include `config.modules.prompt_templating.model.name`

4. **Hardcoded Deployment:**
   - ❌ Uses hardcoded deployment ID
   - ✅ Should discover running orchestration deployment dynamically

---

## How to Fix expressecm-genai

### Current Code (Lines ~276-295 in OnboardingSetup.controller.js):

```javascript
var endpoint = that._aiConfig.baseUrl + 
    "/inference/deployments/d0e8c5c3e4b01dd5/chat/completions?api-version=2024-02-01";

fetch(endpoint, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "AI-Resource-Group": that._aiConfig.resourceGroup || "default"
    },
    body: JSON.stringify({
        messages: [
            {
                role: "system",
                content: "You are an HR data generator..."
            },
            {
                role: "user",
                content: prompt
            }
        ],
        max_tokens: 4000,
        temperature: 0.7
    })
})
```

### Fixed Code (Like AI-Sidebar):

```javascript
// 1. First, discover the orchestration deployment URL
var orchestrationUrl = await getOrchestrationDeploymentUrl(that._aiConfig);

// 2. Build the endpoint
var endpoint = orchestrationUrl + "/v2/completion";

// 3. Prepare messages array
var messages = [
    {
        role: "system",
        content: "You are an HR data generator. Generate realistic employee data in JSON format."
    },
    {
        role: "user",
        content: prompt
    }
];

// 4. Use orchestration format
fetch(endpoint, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "AI-Resource-Group": that._aiConfig.resourceGroup || "default"
    },
    body: JSON.stringify({
        config: {
            modules: {
                prompt_templating: {
                    model: {
                        name: "anthropic--claude-4.6-sonnet",  // Specify model!
                        params: {
                            max_tokens: 4000,
                            temperature: 0.7
                        }
                    },
                    prompt: {
                        template: messages  // Wrap messages here
                    }
                }
            }
        }
    })
})
```

---

## Summary

| Aspect | AI-Sidebar | expressecm-genai | Status |
|--------|-----------|------------------|---------|
| API Pattern | Orchestration `/v2/completion` | Chat Completions `/chat/completions` | ❌ Wrong |
| Request Format | `config.modules.prompt_templating` | Raw `messages` array | ❌ Wrong |
| Model Specification | ✅ `anthropic--claude-4.6-sonnet` | ❌ Not specified | ❌ Missing |
| Deployment Discovery | ✅ Dynamic from `/v2/lm/deployments` | ❌ Hardcoded ID | ❌ Brittle |
| BTP Destination | ✅ Yes (with OAuth) | ✅ Yes (with OAuth) | ✅ Correct |

## Recommendation

Update the `_callAIService` function in `expressecm-genai/webapp/controller/OnboardingSetup.controller.js` to use the same orchestration pattern as AI-Sidebar-Extension.

**Key Changes Needed:**
1. Change endpoint from `/chat/completions` to `/v2/completion`
2. Wrap messages in orchestration format
3. Specify model name (e.g., `anthropic--claude-4.6-sonnet`)
4. Optionally: discover deployment dynamically instead of hardcoding

Would you like me to fix the controller code to use the correct orchestration format like your AI-Sidebar?