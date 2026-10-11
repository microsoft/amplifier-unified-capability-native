/** Scoped public action schemas; session authority is trusted host context. */
export const ACTION_SCHEMAS:Record<string,{description:string;schema:Record<string,any>}>= {
 "providers.imageModels":{description:"Read the selected account's image model catalog without generating images or listing chat models",schema:{type:"object",properties:{id:{type:"string",minLength:1,maxLength:200},refresh:{type:"boolean"},sessionId:{type:"string",maxLength:8192}},required:["id"],additionalProperties:false}},
 "providers.configureImages":{description:"Configure image generation independently of chat models and credentials; exclusive selects one image connection",schema:{type:"object",properties:{id:{type:"string",minLength:1,maxLength:200},enabled:{type:"boolean"},model:{type:"string",maxLength:400},exclusive:{type:"boolean"},scope:{enum:["global","project","local"]},sessionId:{type:"string",maxLength:8192}},required:["id","enabled"],additionalProperties:false}},
 "session.titlePreview":{description:"Read a bounded first-message label for an unnamed chat without renaming or executing it",schema:{type:"object",properties:{id:{type:"string",maxLength:8192},sessionId:{type:"string",maxLength:8192}},additionalProperties:false}},
 "session.naming":{description:"Generate a conversation name once or update automatic naming policy with canonical revision protection",schema:{type:"object",properties:{id:{type:"string",maxLength:8192},sessionId:{type:"string",maxLength:8192},regenerate:{const:true},automatic:{type:"boolean"}},oneOf:[{required:["regenerate"],not:{required:["automatic"]}},{required:["automatic"],not:{required:["regenerate"]}}],additionalProperties:false}},
 "context.clear.review":{description:"Review history-preserving context clear for the selected session",schema:{type:"object",properties:{},additionalProperties:false}},
 "context.clear":{description:"Clear reviewed session context while preserving canonical history and events",schema:{type:"object",properties:{expectedHistoryRevision:{type:"string",pattern:"^[0-9a-f]{64}$"},expectedControlRevision:{type:"string",pattern:"^[0-9a-f]{64}$"}},required:["expectedHistoryRevision","expectedControlRevision"],additionalProperties:false}},
 "context.clear.receipt":{description:"Inspect the exact original context clear without repeating it or opening a worker",schema:{type:"object",properties:{commandId:{type:"string",minLength:1,maxLength:256}},required:["commandId"],additionalProperties:false}},
  "providers.credentials": {
    "description": "Check provider credential environment availability without revealing values",
    "schema": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string",
          "maxLength": 8192
        },
        "module": {
          "type": "string",
          "maxLength": 200
        },
        "envVar": {
          "type": "string",
          "maxLength": 200
        }
      },
      "required": [
        "module"
      ],
      "additionalProperties": false
    }
  },
  "providers.reorder": {
    "description": "Save complete provider preference order atomically; expectedIds must match the current order",
    "schema": {
      "type": "object",
      "properties": {
        "ids": {
          "type": "array",
          "uniqueItems": true,
          "maxItems": 1000,
          "items": {
            "type": "string",
            "maxLength": 200
          }
        },
        "expectedIds": {
          "type": "array",
          "items": {
            "type": "string",
            "maxLength": 200
          }
        },
        "scope": {
          "enum": [
            "global",
            "project",
            "local"
          ]
        },
        "sessionId": {
          "type": "string",
          "maxLength": 8192
        }
      },
      "required": [
        "ids",
        "expectedIds"
      ],
      "additionalProperties": false
    }
  },
  "bundles.reorder": {
    "description": "Save composition order of enabled app capabilities; excludes standalone aliases",
    "schema": {
      "type": "object",
      "properties": {
        "ids": {
          "type": "array",
          "uniqueItems": true,
          "maxItems": 1000,
          "items": {
            "type": "string",
            "maxLength": 200
          }
        },
        "expectedIds": {
          "type": "array",
          "items": {
            "type": "string",
            "maxLength": 200
          }
        }
      },
      "required": [
        "ids",
        "expectedIds"
      ],
      "additionalProperties": false
    }
  },
  "providers.move": {
    "description": "Reorder saved provider connections",
    "schema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "maxLength": 200
        },
        "beforeId": {
          "type": [
            "string",
            "null"
          ]
        },
        "scope": {
          "enum": [
            "global",
            "project",
            "local"
          ]
        },
        "sessionId": {
          "type": "string",
          "maxLength": 8192
        }
      },
      "required": [
        "id"
      ],
      "additionalProperties": false
    }
  },
  "providers.schema": {
    "description": "Read a provider module\u2019s configuration fields and choices",
    "schema": {
      "type": "object",
      "properties": {
        "module": {
          "type": "string",
          "maxLength": 200
        },
        "id": {
          "type": "string",
          "maxLength": 200
        },
        "sessionId": {
          "type": "string",
          "maxLength": 8192
        }
      },
      "required": [
        "module"
      ],
      "additionalProperties": false
    }
  },
  "configuration.defaults": {
    "description": "Resolve new-chat bundle and model without creating a conversation",
    "schema": {
      "type": "object",
      "properties": {
        "location": {
          "type": "object",
          "properties": {
            "kind": {
              "enum": [
                "workspace",
                "managed"
              ]
            }
          },
          "required": [
            "kind"
          ],
          "additionalProperties": false
        },
        "workspace": {
          "type": "string",
          "maxLength": 4000
        },
        "bundle": {
          "type": "string",
          "maxLength": 4000
        }
      },
      "required": [],
      "additionalProperties": false
    }
  },
  "providers.list": {
    "description": "List provider connections and setup status without creating a conversation",
    "schema": {
      "type": "object",
      "properties": {
        "location": {
          "type": "object",
          "properties": {
            "kind": {
              "enum": [
                "workspace",
                "managed"
              ]
            }
          },
          "required": [
            "kind"
          ],
          "additionalProperties": false
        },
        "sessionId": {
          "type": "string",
          "maxLength": 8192
        },
        "workspace": {
          "type": "string",
          "maxLength": 4000
        }
      },
      "required": [],
      "additionalProperties": false
    }
  },
  "providers.save": {
    "description": "Add or edit a provider connection",
    "schema": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string",
          "maxLength": 8192
        },
        "id": {
          "type": "string",
          "maxLength": 200
        },
        "module": {
          "type": "string",
          "maxLength": 200
        },
        "source": {
          "type": "string",
          "maxLength": 4000
        },
        "config": {
          "type": "object"
        },
        "apiKey": {
          "type": "string",
          "maxLength": 16000
        },
        "apiKeyEnv": {
          "type": "string",
          "maxLength": 200
        },
        "useGitHubCli": {
          "type": "boolean"
        },
        "scope": {
          "enum": [
            "global",
            "project",
            "local"
          ]
        }
      },
      "required": [
        "module",
        "config"
      ],
      "additionalProperties": false
    }
  },
  "providers.finishSetup": {
    "description": "Save a connection's default model while preserving provider fields and existing model rules. Optionally initialize general and fast rules only for the first connection without custom routing.",
    "schema": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string",
          "maxLength": 8192
        },
        "id": {
          "type": "string",
          "maxLength": 200
        },
        "model": {
          "type": "string",
          "maxLength": 200
        },
        "scope": {
          "enum": [
            "global",
            "project",
            "local"
          ]
        },
        "initializeRouting": {
          "type": "boolean"
        }
      },
      "required": [
        "id",
        "model"
      ],
      "additionalProperties": false
    }
  },
  "providers.remove": {
    "description": "Remove a provider connection",
    "schema": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string",
          "maxLength": 8192
        },
        "id": {
          "type": "string",
          "maxLength": 200
        },
        "scope": {
          "enum": [
            "global",
            "project",
            "local"
          ]
        }
      },
      "required": [
        "id"
      ],
      "additionalProperties": false
    }
  },
  "providers.testMessage": {
    "description": "Send a small real inference request using a saved provider and model. May incur provider usage charges. Creates no conversation.",
    "schema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "maxLength": 200
        },
        "sessionId": {
          "type": "string",
          "maxLength": 8192
        },
        "workspace": {
          "type": "string",
          "maxLength": 4000
        },
        "model": {
          "type": "string",
          "maxLength": 200
        }
      },
      "required": [
        "id"
      ],
      "additionalProperties": false
    }
  },
  "providers.test": {
    "description": "Test a configured provider",
    "schema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "maxLength": 200
        },
        "sessionId": {
          "type": "string",
          "maxLength": 8192
        }
      },
      "required": [
        "id"
      ],
      "additionalProperties": false
    }
  },
  "providers.models": {
    "description": "Browse cached provider models; refresh only this provider when requested",
    "schema": {
      "type": "object",
      "properties": {
        "location": {
          "type": "object",
          "properties": {
            "kind": {
              "enum": [
                "workspace",
                "managed"
              ]
            }
          },
          "required": [
            "kind"
          ],
          "additionalProperties": false
        },
        "id": {
          "type": "string",
          "maxLength": 200
        },
        "sessionId": {
          "type": "string",
          "maxLength": 8192
        },
        "workspace": {
          "type": "string",
          "maxLength": 4000
        },
        "refresh": {
          "type": "boolean"
        }
      },
      "required": [
        "id"
      ],
      "additionalProperties": false
    }
  },
  "providers.login": {
    "description": "Sign in to a provider",
    "schema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "maxLength": 200
        },
        "sessionId": {
          "type": "string",
          "maxLength": 8192
        },
        "scope": {
          "enum": [
            "global",
            "project",
            "local"
          ]
        },
        "authMode": {
          "enum": [
            "chatgpt_codex",
            "chatgpt_plan",
            "legacy_codex"
          ]
        },
        "enablePlan": {
          "type": "boolean"
        }
      },
      "required": [
        "id"
      ],
      "additionalProperties": false
    }
  },
  "providers.loginStatus": {
    "description": "Check original provider sign-in progress; scoped selectors require negotiated standalone administration support",
    "schema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "maxLength": 200
        },
        "sessionId": {"type":"string","minLength":1,"maxLength":8192},
        "scope": {"type":"string","enum":["global","project","local"]},
        "loginId": {"type":"string","pattern":"^[a-f0-9]{32}$"}
      },
      "required": [
        "id"
      ],
      "dependentRequired":{"sessionId":["scope","loginId"]},
      "additionalProperties": false
    }
  },
  "providers.loginCancel": {
    "description": "Cancel original provider sign-in; scoped selectors require negotiated standalone administration support",
    "schema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "maxLength": 200
        },
        "sessionId": {"type":"string","minLength":1,"maxLength":8192},
        "scope": {"type":"string","enum":["global","project","local"]},
        "loginId": {"type":"string","pattern":"^[a-f0-9]{32}$"}
      },
      "required": [
        "id"
      ],
      "dependentRequired":{"sessionId":["scope","loginId"]},
      "additionalProperties": false
    }
  },
  "routing.list": {
    "description": "List model routing presets",
    "schema": {
      "type": "object",
      "properties": {},
      "required": [],
      "additionalProperties": false
    }
  },
  "routing.show": {
    "description": "Inspect a routing preset",
    "schema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "maxLength": 200
        }
      },
      "required": [
        "name"
      ],
      "additionalProperties": false
    }
  },
  "routing.use": {
    "description": "Use a model routing preset",
    "schema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "maxLength": 200
        },
        "scope": {
          "enum": [
            "global",
            "project",
            "local"
          ]
        }
      },
      "required": [
        "name"
      ],
      "additionalProperties": false
    }
  },
  "routing.save": {
    "description": "Save a custom routing preset",
    "schema": {
      "type": "object",
      "properties": {
        "activate": {
          "type": "boolean"
        },
        "name": {
          "type": "string",
          "maxLength": 200
        },
        "matrix": {
          "type": "object"
        },
        "scope": {
          "enum": [
            "global",
            "project",
            "local"
          ]
        }
      },
      "required": [
        "name",
        "matrix"
      ],
      "additionalProperties": false
    }
  },
  "bundle.preview": {
    "description": "Preview a replacement root bundle for an idle conversation",
    "schema": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string",
          "maxLength": 8192
        },
        "bundle": {
          "type": "string",
          "maxLength": 2000
        }
      },
      "required": [
        "bundle"
      ],
      "additionalProperties": false
    }
  },
  "bundle.switch": {
    "description": "Switch an idle conversation; optional previewId checks a reviewed preview; preserve history and compatible model selection",
    "schema": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string",
          "maxLength": 8192
        },
        "bundle": {
          "type": "string",
          "maxLength": 2000
        },
        "previewId": {
          "type": "string",
          "maxLength": 100
        },
        "resetModel": {
          "type": "boolean"
        }
      },
      "required": [
        "bundle"
      ],
      "additionalProperties": false
    }
  },
  "bundle.default": {
    "description": "Set or clear the default root for this app, workspace, or shared Amplifier settings",
    "schema": {
      "type": "object",
      "properties": {
        "scope": {
          "enum": [
            "app",
            "workspace",
            "shared"
          ]
        },
        "bundle": {
          "type": [
            "string",
            "null"
          ],
          "minLength": 1,
          "maxLength": 2000
        },
        "workspace": {
          "type": "string",
          "maxLength": 4000
        }
      },
      "required": [
        "scope",
        "bundle"
      ],
      "additionalProperties": false
    }
  },
  "bundle.discover": {
    "description": "Browse bundles and behaviors in a Git repository",
    "schema": {
      "type": "object",
      "properties": {
        "url": {
          "type": "string",
          "maxLength": 4000
        }
      },
      "required": [
        "url"
      ],
      "additionalProperties": false
    }
  },
  "bundles.list": {
    "description": "List app behaviors and standalone bundles",
    "schema": {
      "type": "object",
      "properties": {},
      "required": [],
      "additionalProperties": false
    }
  },
  "bundles.add": {
    "description": "Add a behavior or standalone bundle",
    "schema": {
      "type": "object",
      "properties": {
        "uri": {
          "type": "string",
          "maxLength": 4000
        },
        "reviewId": {
          "type": "string",
          "maxLength": 32
        },
        "name": {
          "type": "string",
          "maxLength": 200
        },
        "role": {
          "enum": [
            "behavior",
            "standalone"
          ]
        }
      },
      "required": [
        "uri",
        "role"
      ],
      "additionalProperties": false
    }
  },
  "bundles.toggle": {
    "description": "Enable or disable an app behavior",
    "schema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "maxLength": 200
        },
        "enabled": {
          "type": "boolean"
        }
      },
      "required": [
        "id",
        "enabled"
      ],
      "additionalProperties": false
    }
  },
  "bundles.remove": {
    "description": "Remove a registered bundle",
    "schema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "maxLength": 200
        }
      },
      "required": [
        "id"
      ],
      "additionalProperties": false
    }
  },
  "bundles.move": {
    "description": "Reorder app behaviors",
    "schema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "maxLength": 200
        },
        "direction": {
          "enum": [
            "up",
            "down"
          ]
        },
        "beforeId": {
          "type": [
            "string",
            "null"
          ]
        }
      },
      "required": [
        "id"
      ],
      "additionalProperties": false
    }
  },
  "bundle.export": {
    "description": "Export the conversation's customized bundle",
    "schema": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string",
          "maxLength": 8192
        },
        "name": {
          "type": "string",
          "maxLength": 200
        },
        "description": {
          "type": "string",
          "maxLength": 1000
        }
      },
      "required": [
        "sessionId"
      ],
      "additionalProperties": false
    }
  },
  "bundle.receipt": {
    "description": "Inspect exact native receipts for an original bundle command without starting or replaying work",
    "schema": {"type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":256},"operation":{"enum":["bundle.save","bundle.export","bundle.default","bundle.switch"]}},"required":["commandId","operation"],"additionalProperties":false}
  },
  "bundle.save": {
    "description": "Save and use the conversation's customized bundle",
    "schema": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string",
          "maxLength": 8192
        },
        "name": {
          "type": "string",
          "maxLength": 200
        },
        "description": {
          "type": "string",
          "maxLength": 1000
        }
      },
      "required": [
        "sessionId",
        "name"
      ],
      "additionalProperties": false
    }
  },
  "configuration.cancel": {
    "description": "Cancel the exact queued mount-plan change returned by configuration.inspect",
    "schema": {
      "type": "object",
      "properties": {"pendingCommandId":{"type":"string","minLength":1,"maxLength":256}},
      "required": ["pendingCommandId"],
      "additionalProperties": false
    }
  },
  "configuration.inspect": {
    "description": "Inspect resolved modules and configuration",
    "schema": {
      "type": "object",
      "properties": {},
      "required": [],
      "additionalProperties": false
    }
  },
  "configuration.apply": {
    "description": "Apply edits to the loaded session mount plan, optionally waiting for idle",
    "schema": {
      "type": "object",
      "properties": {
        "config": {
          "type": "object"
        },
        "whenIdle": {
          "type": "boolean"
        },
        "expectedConfigurationRevision": {
          "type": "string",
          "pattern": "^[a-f0-9]{64}$"
        }
      },
      "required": [
        "config",
        "expectedConfigurationRevision"
      ],
      "additionalProperties": false
    }
  },
  "runtime.control": {
    "description": "Manage runtime modes, goals, provider, budgets, skills and tools",
    "schema": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string",
          "maxLength": 8192
        },
        "operation": {
          "type": "string",
          "maxLength": 100
        },
        "args": {
          "type": "object"
        }
      },
      "required": [
        "operation"
      ],
      "additionalProperties": false
    }
  },
  "modules.list": {
    "description": "List scoped module configuration",
    "schema": {
      "type": "object",
      "properties": {
        "scope": {
          "enum": [
            "global",
            "project",
            "local"
          ]
        }
      },
      "required": [],
      "additionalProperties": false
    }
  },
  "modules.save": {
    "description": "Add or override a scoped module",
    "schema": {
      "type": "object",
      "properties": {
        "section": {
          "enum": [
            "tools",
            "hooks",
            "providers",
            "orchestrator",
            "context"
          ]
        },
        "module": {
          "type": "string",
          "maxLength": 200
        },
        "id": {
          "type": "string",
          "maxLength": 200
        },
        "source": {
          "type": "string",
          "maxLength": 4000
        },
        "config": {
          "type": "object"
        },
        "enabled": {
          "type": "boolean"
        },
        "scope": {
          "enum": [
            "global",
            "project",
            "local"
          ]
        }
      },
      "required": [
        "section",
        "module"
      ],
      "additionalProperties": false
    }
  },
  "modules.remove": {
    "description": "Remove a scoped module override",
    "schema": {
      "type": "object",
      "properties": {
        "section": {
          "type": "string",
          "maxLength": 100
        },
        "id": {
          "type": "string",
          "maxLength": 200
        },
        "scope": {
          "enum": [
            "global",
            "project",
            "local"
          ]
        }
      },
      "required": [
        "section",
        "id"
      ],
      "additionalProperties": false
    }
  },
  "modules.validate": {
    "description": "Validate a module using its public Core contract",
    "schema": {
      "type": "object",
      "properties": {
        "behavioral": {
          "type": "boolean"
        },
        "section": {
          "type": "string",
          "maxLength": 100
        },
        "id": {
          "type": "string",
          "maxLength": 200
        },
        "scope": {
          "enum": [
            "global",
            "project",
            "local"
          ]
        }
      },
      "required": [
        "section",
        "id"
      ],
      "additionalProperties": false
    }
  },
  "sources.list": {
    "description": "List scoped source overrides",
    "schema": {
      "type": "object",
      "properties": {
        "scope": {
          "enum": [
            "global",
            "project",
            "local"
          ]
        }
      },
      "required": [],
      "additionalProperties": false
    }
  },
  "sources.validate": {
    "description": "Validate a candidate module source without saving it",
    "schema": {
      "type": "object",
      "properties": {
        "kind": {
          "enum": [
            "module"
          ]
        },
        "name": {
          "type": "string",
          "maxLength": 200
        },
        "source": {
          "type": "string",
          "maxLength": 4000
        },
        "section": {
          "enum": [
            "tools",
            "hooks",
            "providers",
            "orchestrator",
            "context"
          ]
        },
        "scope": {
          "enum": [
            "global",
            "project",
            "local"
          ]
        }
      },
      "required": [
        "kind",
        "name",
        "source",
        "section"
      ],
      "additionalProperties": false
    }
  },
  "sources.save": {
    "description": "Set a scoped bundle or module source; validate=true validates the candidate first and saves only on success",
    "schema": {
      "type": "object",
      "properties": {
        "kind": {
          "enum": [
            "module",
            "bundle"
          ]
        },
        "name": {
          "type": "string",
          "maxLength": 200
        },
        "source": {
          "type": "string",
          "maxLength": 4000
        },
        "validate": {
          "type": "boolean"
        },
        "section": {
          "enum": [
            "tools",
            "hooks",
            "providers",
            "orchestrator",
            "context"
          ]
        },
        "scope": {
          "enum": [
            "global",
            "project",
            "local"
          ]
        }
      },
      "required": [
        "kind",
        "name",
        "source"
      ],
      "additionalProperties": false
    }
  },
  "sources.remove": {
    "description": "Remove a scoped source override",
    "schema": {
      "type": "object",
      "properties": {
        "kind": {
          "enum": [
            "module",
            "bundle"
          ]
        },
        "name": {
          "type": "string",
          "maxLength": 200
        },
        "scope": {
          "enum": [
            "global",
            "project",
            "local"
          ]
        }
      },
      "required": [
        "kind",
        "name"
      ],
      "additionalProperties": false
    }
  }
};
ACTION_SCHEMAS['configuration.toggle']={description:'Enable or disable a mounted module through native configurator controls.',schema:{type:'object',properties:{section:{enum:['tools','providers','agents','context']},name:{type:'string',minLength:1,maxLength:200},enabled:{type:'boolean'}},required:['section','name','enabled'],additionalProperties:false}};
