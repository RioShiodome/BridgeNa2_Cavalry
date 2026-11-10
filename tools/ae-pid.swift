import Foundation
import Carbon
let args=CommandLine.arguments
if args.count != 3 { fatalError("usage: ae-pid PID JSX_PATH") }
let script=try String(contentsOfFile:args[2],encoding:.utf8)
let event=NSAppleEventDescriptor(eventClass:0x6d697363,eventID:0x646f7363,targetDescriptor:NSAppleEventDescriptor(processIdentifier:pid_t(args[1])!),returnID:AEReturnID(kAutoGenerateReturnID),transactionID:AETransactionID(kAnyTransactionID))
event.setParam(NSAppleEventDescriptor(string:script),forKeyword:0x2d2d2d2d)
do { let reply=try event.sendEvent(options:.waitForReply,timeout:30); print(reply) } catch { fputs(String(describing:error)+"\n",stderr); exit(1) }
