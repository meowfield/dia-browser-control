#!/usr/bin/env node

// Simple test script to verify CDP connectivity
// Run this to test if Dia Browser is properly configured

async function testCDPConnection() {
  const cdpPort = 9222;
  const cdpHost = '127.0.0.1';
  const cdpBaseUrl = `http://${cdpHost}:${cdpPort}`;

  console.log('Testing Chrome DevTools Protocol connection...');
  console.log(`CDP URL: ${cdpBaseUrl}`);

  try {
    // Test basic connectivity
    console.log('\n1. Testing basic connectivity...');
    const response = await fetch(`${cdpBaseUrl}/json/version`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const version = await response.json();
    console.log('✅ CDP connection successful!');
    console.log(`Browser: ${version.Browser}`);
    console.log(`User-Agent: ${version['User-Agent']}`);
    console.log(`WebSocket URL: ${version.webSocketDebuggerUrl}`);

    // Test tab listing
    console.log('\n2. Testing tab listing...');
    const tabsResponse = await fetch(`${cdpBaseUrl}/json`);
    const tabs = await tabsResponse.json();
    
    console.log(`✅ Found ${tabs.length} total targets`);
    const pageTabs = tabs.filter(tab => tab.type === 'page');
    console.log(`✅ Found ${pageTabs.length} page tabs`);
    
    if (pageTabs.length > 0) {
      console.log('\nActive tabs:');
      pageTabs.forEach((tab, index) => {
        console.log(`  ${index + 1}. ${tab.title} - ${tab.url}`);
        console.log(`     ID: ${tab.id}`);
      });
    }

    console.log('\n✅ All tests passed! Dia Browser is properly configured for CDP.');
    
  } catch (error) {
    process.exitCode = 1;
    console.error('\n❌ CDP connection failed!');

    if (error.cause?.code === 'ECONNREFUSED' || error.message.includes('fetch failed')) {
      console.error('\nDia Browser is not running with remote debugging enabled.');
      console.error('\nTo fix this:');
      console.error('1. Close Dia Browser completely');
      console.error('2. Launch with: /Applications/Dia.app/Contents/MacOS/Dia --remote-debugging-port=9222');
      console.error('3. Run this test again');
      console.error('\nAlternatively, you can create a script:');
      console.error('echo "#!/bin/bash" > ~/dia-debug.sh');
      console.error('echo "/Applications/Dia.app/Contents/MacOS/Dia --remote-debugging-port=9222" >> ~/dia-debug.sh');
      console.error('chmod +x ~/dia-debug.sh');
      console.error('~/dia-debug.sh');
    } else {
      console.error(`Error: ${error.message}`);
    }

    console.error('\n📝 Note: This is expected if Dia Browser is not running with remote debugging.');
    console.error('The MCP extension will work once you follow the setup instructions above.');
  }
}

// Run the test
testCDPConnection().catch(console.error);
